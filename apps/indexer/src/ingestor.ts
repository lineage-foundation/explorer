import type { Database } from "@explorer/db";
import { getMaxBlockNum, getBlockHashByNum, resetIndexedChain } from "@explorer/db";
import type { LineageBlock } from "@explorer/chain";
import type { IndexerConfig } from "./config.js";
import type { SourceClient } from "./source.js";
import { processBlock, type PreparedTx } from "./block-processor.js";

export interface WorkerLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export class ContinuityError extends Error {
  constructor(readonly atNum: number, readonly expected: string, readonly actual: string) {
    super(`Continuity break at block ${atNum}: expected previous_hash ${expected}, got ${actual}`);
    this.name = "ContinuityError";
  }
}

/**
 * A block references a transaction the source returned a successful response
 * without — i.e. genuinely missing, not a transport failure (those propagate
 * from the client after its retries). Thrown so the cycle aborts the block and
 * retries next time rather than persisting it permanently incomplete. Hashes the
 * operator has listed in `skipTxHashes` are expected to be absent and do not
 * trigger this.
 */
export class MissingTransactionError extends Error {
  constructor(readonly hash: string, readonly blockNum: number) {
    super(`Block ${blockNum} references transaction ${hash} that the source did not return`);
    this.name = "MissingTransactionError";
  }
}

export function createIngestor(deps: {
  db: Database; source: SourceClient; config: IndexerConfig; logger: WorkerLogger;
}): { runCycle: () => Promise<{ caughtUp: boolean; processedTo?: number }> } {
  const { db, source, config, logger } = deps;
  const skip = new Set(config.skipTxHashes);

  return {
    async runCycle() {
      const storedMax = await getMaxBlockNum(db);
      const latest = (await source.getLatestBlock()).header.b_num;

      // Detect a diverged source chain (reset or reorg) before advancing. The
      // ingestor otherwise assumes monotonic forward growth: after a reset it
      // would see stored tip > source tip, report "caught up", and stall on
      // stale data forever. On confirmed divergence, resync from genesis.
      let maxNum = storedMax;
      if (storedMax !== null && (await sourceDiverged(db, source, storedMax, latest))) {
        logger.warn(
          { event: "chain.reset", storedMax, sourceLatest: latest },
          "source chain diverged from indexed data — resyncing from genesis",
        );
        await resetIndexedChain(db);
        maxNum = null;
      }

      const from = maxNum === null ? config.genesisHeight : maxNum + 1;
      if (from > latest) return { caughtUp: true };

      const to = Math.min(from + config.maxBlockRange - 1, latest);
      const range = await source.getBlockRange(from, to);
      range.sort((a, b) => a[1].block.header.b_num - b[1].block.header.b_num);

      let prevHash = from > config.genesisHeight ? await getBlockHashByNum(db, from - 1) : null;
      for (const [blockHash, wrapper] of range) {
        const block = wrapper.block;
        if (prevHash !== null && block.header.previous_hash !== prevHash) {
          logger.error(
            { event: "continuity.break", num: block.header.b_num, expected: prevHash, actual: block.header.previous_hash },
            "continuity break — halting",
          );
          throw new ContinuityError(block.header.b_num, prevHash, block.header.previous_hash);
        }
        await ingestOne(db, block, blockHash, source, skip, logger);
        prevHash = blockHash;
      }
      logger.info({ event: "range.processed", from, to }, "processed block range");
      return { caughtUp: false, processedTo: to };
    },
  };
}

/**
 * Whether the source chain has diverged from our indexed data — i.e. our stored
 * tip is no longer part of the source's chain. Because a block's hash commits to
 * its entire ancestry, a matching hash at the stored tip means every ancestor
 * matches too, so this single comparison detects any reset or reorg within our
 * range. Returns true ONLY on positive evidence (source shorter than our tip, or
 * a confirmed differing hash) — an inconclusive/absent response never triggers a
 * wipe, so a transient node blip cannot destroy indexed data.
 */
async function sourceDiverged(
  db: Database, source: SourceClient, storedMax: number, latest: number,
): Promise<boolean> {
  if (latest < storedMax) return true;
  const [entry] = await source.getBlockRange(storedMax, storedMax);
  const sourceHash = entry?.[0];
  if (sourceHash === undefined) return false; // inconclusive — do not wipe
  const storedHash = await getBlockHashByNum(db, storedMax);
  return sourceHash !== storedHash;
}

async function ingestOne(
  db: Database, block: LineageBlock, blockHash: string, source: SourceClient,
  skip: Set<string>, logger: WorkerLogger,
): Promise<void> {
  const miningHash = block.header.nonce_and_mining_tx_hash[1];
  const coinbaseHash = typeof miningHash === "string" ? miningHash : undefined;

  // unique ordered hash list: block txs (coinbase=false) + mining tx (coinbase=true)
  const order: string[] = [];
  const isCoinbase = new Map<string, boolean>();
  for (const h of block.transactions) { if (!isCoinbase.has(h)) { order.push(h); isCoinbase.set(h, false); } }
  if (coinbaseHash) { if (!isCoinbase.has(coinbaseHash)) order.push(coinbaseHash); isCoinbase.set(coinbaseHash, true); }

  const fetched = new Map(await source.getTransactionsByHash(order));
  const transactions: PreparedTx[] = [];
  for (const hash of order) {
    const tx = fetched.get(hash);
    if (!tx) {
      // Operator-skipped hashes are expected to be absent and are never
      // inserted anyway. Any other missing hash is real data loss: abort the
      // block (before persisting) so the cycle retries instead of storing it
      // permanently incomplete.
      if (skip.has(hash)) continue;
      logger.warn(
        { event: "tx.missing", hash, block: block.header.b_num },
        "required tx not returned by node — aborting block for retry",
      );
      throw new MissingTransactionError(hash, block.header.b_num);
    }
    transactions.push({ hash, tx, coinbase: isCoinbase.get(hash) === true });
  }
  await processBlock(db, { blockHash, block, transactions, skip });
}
