import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createDb,
  type Database,
  schema,
  getBlocks,
  getAccountBalance,
  getAccountTransactions,
  getTransactionByHash,
} from "@explorer/db";
import { createWorker } from "../worker.js";
import { loadConfig } from "../config.js";
import { FakeSourceClient, buildBlock, buildTokenTx, buildSpendTx } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };
let handle: { db: Database; sql: ReturnType<typeof createDb>["sql"]; close: () => Promise<void> };

beforeAll(() => {
  handle = createDb(URL);
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  for (const t of [schema.txInExpanded, schema.txIn, schema.txOut, schema.coinsHistory, schema.transaction, schema.block]) {
    await handle.db.delete(t);
  }
});

describe("worker end-to-end", () => {
  it("ingests a small chain and the real read queries return correct results", async () => {
    const source = new FakeSourceClient();
    source.setSupply("999");
    // block 0: coinbase mints 100 to A; t0 sends 30 to A
    source.addBlock("H0", buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: ["t0"] }));
    source.addTx("cb0", buildTokenTx([{ address: "A", amount: 100 }]));
    source.addTx("t0", buildTokenTx([{ address: "A", amount: 30 }]));
    // block 1: t1 spends A's t0:0 (30) to B
    source.addBlock("H1", buildBlock({ num: 1, hash: "H1", previousHash: "H0", miningTxHash: "cb1", txHashes: ["t1"] }));
    source.addTx("cb1", buildTokenTx([{ address: "A", amount: 100 }]));
    source.addTx("t1", buildSpendTx({ prevHash: "t0", n: 0 }, [{ address: "B", amount: 30 }]));

    const config = loadConfig({ DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", HEALTH_PORT: "" });
    const worker = createWorker({ config, db: handle.db, sql: handle.sql, source, logger: noopLogger });
    await worker.runCycleOnce();
    await worker.runCycleOnce();

    expect((await getBlocks(handle.db, { limit: 10, offset: 0, order: "asc" })).blocks.map((b) => b.num)).toEqual([0, 1]);
    expect((await getAccountBalance(handle.db, "B")).balance).toBe("30");
    expect((await getAccountBalance(handle.db, "A")).balance).toBe("200"); // 100 + 30 - 30 + 100(cb1)
    const bTxs = await getAccountTransactions(handle.db, "B", { limit: 10, offset: 0 });
    expect(bTxs.transactions.some((t) => t.hash === "t1")).toBe(true);
    expect((await getTransactionByHash(handle.db, "t1"))?.outs[0]?.amount).toBe("30");
  });

  it("marks itself stalled after repeated cycle failures and recovers on success", async () => {
    const base = new FakeSourceClient();
    base.addBlock("H0", buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: [] }));
    base.addTx("cb0", buildTokenTx([{ address: "M", amount: 1 }]));
    let fail = true;
    const source = {
      getLatestBlock: () => (fail ? Promise.reject(new Error("node down")) : base.getLatestBlock()),
      getBlockRange: (s: number, e: number) => base.getBlockRange(s, e),
      getTransactionsByHash: (h: string[]) => base.getTransactionsByHash(h),
      getCirculatingSupply: () => base.getCirculatingSupply(),
    };
    const config = loadConfig({
      DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", HEALTH_PORT: "",
      INDEXER_POLL_INTERVAL_MS: "5", INDEXER_HEALTH_MAX_CONSECUTIVE_FAILURES: "3",
    });
    const worker = createWorker({ config, db: handle.db, sql: handle.sql, source, logger: noopLogger });
    await worker.start();
    try {
      // repeated failures past the threshold surface as `stalled` (→ /health 503)
      await waitFor(() => worker.getStatus().stalled !== null);
      expect(worker.getStatus().stalled).toMatch(/consecutive cycle failures: node down/);
      // node recovers → the next successful cycle clears the stalled flag (self-heal)
      fail = false;
      await waitFor(() => worker.getStatus().stalled === null);
      expect(worker.getStatus().stalled).toBeNull();
    } finally {
      await worker.stop();
    }
  });

  it("stop() drains the in-flight cycle before releasing the lock", async () => {
    let releaseCycle!: () => void;
    const gate = new Promise<void>((r) => { releaseCycle = r; });
    let cycleFinished = false;
    const base = new FakeSourceClient();
    base.addBlock("H0", buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: [] }));
    base.addTx("cb0", buildTokenTx([{ address: "M", amount: 1 }]));
    const source = {
      getLatestBlock: async () => { await gate; cycleFinished = true; return base.getLatestBlock(); },
      getBlockRange: (s: number, e: number) => base.getBlockRange(s, e),
      getTransactionsByHash: (h: string[]) => base.getTransactionsByHash(h),
      getCirculatingSupply: () => base.getCirculatingSupply(),
    };
    const config = loadConfig({ DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", HEALTH_PORT: "", INDEXER_POLL_INTERVAL_MS: "5" });
    const worker = createWorker({ config, db: handle.db, sql: handle.sql, source, logger: noopLogger });
    await worker.start();
    await sleep(20); // let the loop reach the gated getLatestBlock

    const stopped = worker.stop();
    let stopResolved = false;
    void stopped.then(() => { stopResolved = true; });
    await sleep(20);
    // stop() must still be pending while the cycle is in-flight
    expect(stopResolved).toBe(false);
    expect(cycleFinished).toBe(false);

    releaseCycle();
    await stopped;
    expect(cycleFinished).toBe(true);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
