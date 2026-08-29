import type { Database } from "@explorer/db";
import { getMaxBlockNum, getBlockHashByNum } from "@explorer/db";
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

export function createIngestor(deps: {
  db: Database; source: SourceClient; config: IndexerConfig; logger: WorkerLogger;
}): { runCycle: () => Promise<{ caughtUp: boolean; processedTo?: number }> } {
  const { db, source, config, logger } = deps;
  const skip = new Set(config.skipTxHashes);

  return {
    async runCycle() {
      const maxNum = await getMaxBlockNum(db);
      const from = maxNum === null ? config.genesisHeight : maxNum + 1;
      const latest = (await source.getLatestBlock()).header.b_num;
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
    if (!tx) { logger.warn({ event: "tx.missing", hash, block: block.header.b_num }, "tx not returned by node"); continue; }
    transactions.push({ hash, tx, coinbase: isCoinbase.get(hash) === true });
  }
  await processBlock(db, { blockHash, block, transactions, skip });
}
