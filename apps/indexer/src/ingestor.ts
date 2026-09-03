import type { Database } from "@explorer/db";
import { getMaxBlockNum, getBlockHashByNum, resetIndexedChain, deleteFromHeight, coinsHistoryHasNullBlockNum } from "@explorer/db";
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
      // stale data forever. On confirmed divergence, rewind to the fork point
      // (shallow reorg) or resync from genesis.
      let maxNum = storedMax;
      if (storedMax !== null && (await sourceDiverged(db, source, storedMax, latest))) {
        maxNum = await handleDivergence(db, source, storedMax, latest, config, logger);
      }

      const from = maxNum === null ? config.genesisHeight : maxNum + 1;
      if (from > latest) return { caughtUp: true };

      const to = Math.min(from + config.maxBlockRange - 1, latest);
      const range = await source.getBlockRange(from, to);
      range.sort((a, b) => a[1].block.header.b_num - b[1].block.header.b_num);

      // The source can return fewer blocks than requested (e.g. under load); only
      // advance progress by what was actually ingested, not the requested `to`.
      if (range.length === 0) {
        logger.warn({ event: "range.empty", from, to }, "source returned no blocks for requested range");
        return { caughtUp: false };
      }

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
      const processedTo = range[range.length - 1]![1].block.header.b_num;
      logger.info({ event: "range.processed", from, to: processedTo }, "processed block range");
      return { caughtUp: false, processedTo };
    },
  };
}

/**
 * Whether the source chain has diverged from our indexed data — i.e. our stored
 * tip is no longer part of the source's chain. Because a block's hash commits to
 * its entire ancestry, comparing the hash at a single shared height detects any
 * reset or reorg within our range.
 *
 * We probe the lower of the two tips: when the source reports a tip *below* ours
 * (a node restarting, or a failover to a lagging replica), a merely-behind node
 * still shares our history — its block at its own tip has the SAME hash we
 * already indexed, so this returns false and we wait rather than wiping. Only a
 * genuinely different hash at that height is divergence. An inconclusive/absent
 * response never triggers a wipe, so a transient node blip cannot destroy
 * indexed data.
 */
async function sourceDiverged(
  db: Database, source: SourceClient, storedMax: number, latest: number,
): Promise<boolean> {
  const probeNum = Math.min(latest, storedMax);
  const [entry] = await source.getBlockRange(probeNum, probeNum);
  const sourceHash = entry?.[0];
  if (sourceHash === undefined) return false; // inconclusive — do not wipe
  const storedHash = await getBlockHashByNum(db, probeNum);
  return sourceHash !== storedHash;
}

const FORK_SEARCH_CHUNK = 100;

/**
 * Respond to confirmed divergence: attempt an incremental rewind to the fork
 * point when enabled and safe, otherwise fall back to a full resync. Returns the
 * new stored tip to resume from (`fork`), or `null` after a full resync (replay
 * from genesis). A full resync is always safe and can never leave a wrong
 * balance, so any uncertainty falls back to it.
 */
async function handleDivergence(
  db: Database, source: SourceClient, storedMax: number, latest: number,
  config: IndexerConfig, logger: WorkerLogger,
): Promise<number | null> {
  if (config.reorgMaxDepth > 0) {
    const fork = await findForkPoint(db, source, storedMax, latest, config.reorgMaxDepth, config.genesisHeight);
    // A legacy snapshot without a block_num can't be rolled back by block_num;
    // its presence forces the full resync (which repopulates block_num).
    if (fork !== null && !(await coinsHistoryHasNullBlockNum(db))) {
      await deleteFromHeight(db, fork);
      logger.warn({ event: "chain.rewind", fork, storedMax, sourceLatest: latest }, "reorg — rewound to fork point");
      return fork;
    }
  }
  await resetIndexedChain(db);
  logger.warn(
    { event: "chain.reset", storedMax, sourceLatest: latest },
    "source chain diverged from indexed data — resyncing from genesis",
  );
  return null;
}

/**
 * Walk block hashes backward from the lower of the two tips to find the highest
 * height where our stored block hash matches the source's — the fork point.
 * Bounded by `maxDepth` (and `genesisHeight`); returns `null` if no common
 * ancestor is found in range or any probe is inconclusive (→ full resync).
 */
async function findForkPoint(
  db: Database, source: SourceClient, storedMax: number, latest: number,
  maxDepth: number, genesisHeight: number,
): Promise<number | null> {
  const start = Math.min(storedMax, latest);
  const floor = Math.max(start - maxDepth, genesisHeight);
  for (let hi = start; hi >= floor; hi -= FORK_SEARCH_CHUNK) {
    const lo = Math.max(hi - FORK_SEARCH_CHUNK + 1, floor);
    const entries = await source.getBlockRange(lo, hi);
    const sourceHashByNum = new Map<number, string>();
    for (const [hash, wrapper] of entries) sourceHashByNum.set(wrapper.block.header.b_num, hash);
    for (let n = hi; n >= lo; n--) {
      const theirHash = sourceHashByNum.get(n);
      const ourHash = await getBlockHashByNum(db, n);
      if (theirHash === undefined || ourHash === null) return null; // inconclusive → full resync
      if (theirHash === ourHash) return n; // highest common ancestor
    }
  }
  return null; // no common ancestor within maxDepth
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
  await processBlock(db, { blockHash, block, transactions, skip, logger });
}
