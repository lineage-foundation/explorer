import { it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, type Database, schema, getBlocks, getMaxBlockNum, getBlockHashByNum, getAccountBalance } from "@explorer/db";
import { createIngestor, ContinuityError, MissingTransactionError } from "../ingestor.js";
import { loadConfig } from "../config.js";
import { FakeSourceClient, buildBlock, buildTokenTx, buildSpendTx } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const noopLogger = { info: () => {}, error: () => {}, warn: () => {} };
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;
const cfg = () => loadConfig({ DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", INDEXER_MAX_BLOCK_RANGE: "10" });

function chainOf(n: number, source: FakeSourceClient, prefix = "H") {
  let prev = "";
  for (let i = 0; i <= n; i++) {
    const hash = `${prefix}${i}`, cb = `cb${prefix}${i}`, t = `t${prefix}${i}`;
    source.addBlock(hash, buildBlock({ num: i, hash, previousHash: prev, miningTxHash: cb, txHashes: [t] }));
    source.addTx(cb, buildTokenTx([{ address: "M", amount: 50 }]));
    source.addTx(t, buildTokenTx([{ address: `addr${i}`, amount: 10 }]));
    prev = hash;
  }
}

beforeAll(() => { handle = createDb(URL); });
afterAll(async () => { await handle.close(); });
beforeEach(async () => {
  for (const t of [schema.txInExpanded, schema.txIn, schema.txOut, schema.coinsHistory, schema.transaction, schema.block]) {
    await db().delete(t);
  }
});

it("ingests from genesis to tip, then reports caught up", async () => {
  const source = new FakeSourceClient(); chainOf(3, source);
  const ing = createIngestor({ db: db(), source, config: cfg(), logger: noopLogger });
  await ing.runCycle();
  expect(await getMaxBlockNum(db())).toBe(3);
  const again = await ing.runCycle();
  expect(again.caughtUp).toBe(true);
});

it("resumes from max(num)+1 and is idempotent", async () => {
  const source = new FakeSourceClient(); chainOf(2, source);
  const ing = createIngestor({ db: db(), source, config: cfg(), logger: noopLogger });
  await ing.runCycle();
  await ing.runCycle(); // no new blocks; no duplicates
  expect((await getBlocks(db(), { limit: 100, offset: 0, order: "asc" })).blocks).toHaveLength(3);
});

it("resyncs from genesis when the source resets to a shorter, different chain", async () => {
  const source = new FakeSourceClient(); chainOf(5, source);
  await createIngestor({ db: db(), source, config: cfg(), logger: noopLogger }).runCycle();
  expect(await getMaxBlockNum(db())).toBe(5);

  // Source wiped and re-genesised: a brand-new chain only 2 blocks tall.
  const fresh = new FakeSourceClient(); chainOf(2, fresh, "R");
  const res = await createIngestor({ db: db(), source: fresh, config: cfg(), logger: noopLogger }).runCycle();
  expect(res.caughtUp).toBe(false);
  const blocks = (await getBlocks(db(), { limit: 100, offset: 0, order: "asc" })).blocks;
  expect(blocks.map((b) => b.num)).toEqual([0, 1, 2]);
  expect(blocks.map((b) => b.hash)).toEqual(["R0", "R1", "R2"]);
});

it("resyncs when the source reorgs to a same-height chain with different hashes", async () => {
  const source = new FakeSourceClient(); chainOf(3, source);
  await createIngestor({ db: db(), source, config: cfg(), logger: noopLogger }).runCycle();
  expect(await getMaxBlockNum(db())).toBe(3);

  const forked = new FakeSourceClient(); chainOf(3, forked, "F");
  await createIngestor({ db: db(), source: forked, config: cfg(), logger: noopLogger }).runCycle();
  const blocks = (await getBlocks(db(), { limit: 100, offset: 0, order: "asc" })).blocks;
  expect(blocks.map((b) => b.hash)).toEqual(["F0", "F1", "F2", "F3"]);
});

it("rewinds to the fork point on a shallow reorg and restores balances (reorgMaxDepth > 0)", async () => {
  // chain A: block 0 mints 100 to A; block 1 spends A's 100 to B.
  const a = new FakeSourceClient();
  a.addBlock("A0", buildBlock({ num: 0, hash: "A0", previousHash: "", miningTxHash: "cb0", txHashes: [] }));
  a.addTx("cb0", buildTokenTx([{ address: "A", amount: 100 }]));
  a.addBlock("A1", buildBlock({ num: 1, hash: "A1", previousHash: "A0", miningTxHash: "cb1", txHashes: ["t1"] }));
  a.addTx("cb1", buildTokenTx([{ address: "M", amount: 50 }]));
  a.addTx("t1", buildSpendTx({ prevHash: "cb0", n: 0 }, [{ address: "B", amount: 100 }]));
  const reorgCfg = loadConfig({
    DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", INDEXER_MAX_BLOCK_RANGE: "10", INDEXER_REORG_MAX_DEPTH: "10",
  });
  await createIngestor({ db: db(), source: a, config: reorgCfg, logger: noopLogger }).runCycle();
  expect((await getAccountBalance(db(), "A")).balance).toBe("0");
  expect((await getAccountBalance(db(), "B")).balance).toBe("100");

  // chain B forks at block 0: a different block 1 that never spends A.
  const b = new FakeSourceClient();
  b.addBlock("A0", buildBlock({ num: 0, hash: "A0", previousHash: "", miningTxHash: "cb0", txHashes: [] }));
  b.addTx("cb0", buildTokenTx([{ address: "A", amount: 100 }]));
  b.addBlock("B1", buildBlock({ num: 1, hash: "B1", previousHash: "A0", miningTxHash: "cb1b", txHashes: [] }));
  b.addTx("cb1b", buildTokenTx([{ address: "M", amount: 50 }]));
  const warn = vi.fn();
  await createIngestor({ db: db(), source: b, config: reorgCfg, logger: { info: () => {}, warn, error: () => {} } }).runCycle();

  // an incremental rewind to the fork (not a full resync)
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: "chain.rewind", fork: 0 }), expect.any(String));
  expect(await getBlockHashByNum(db(), 1)).toBe("B1"); // block 1 replaced
  // A's spend was rolled back → balance restored; B's receipt is gone
  expect((await getAccountBalance(db(), "A")).balance).toBe("100");
  expect((await getAccountBalance(db(), "B")).balance).toBe("0");
  expect(await getMaxBlockNum(db())).toBe(1);
});

it("does not wipe when the source merely lags behind (lower tip, same history)", async () => {
  const source = new FakeSourceClient(); chainOf(5, source);
  await createIngestor({ db: db(), source, config: cfg(), logger: noopLogger }).runCycle();
  expect(await getMaxBlockNum(db())).toBe(5);

  // Node restart / failover to a lagging replica: it reports tip 3, but its
  // block 3 is the SAME block we already indexed (same chain, just behind) — a
  // transient lag, NOT a reset. Must not trigger a destructive wipe.
  const lagging = new FakeSourceClient(); chainOf(3, lagging); // same default "H" prefix → matching hashes
  const res = await createIngestor({ db: db(), source: lagging, config: cfg(), logger: noopLogger }).runCycle();
  expect(res.caughtUp).toBe(true);
  expect(await getMaxBlockNum(db())).toBe(5); // untouched — no wipe
});

it("does not wipe indexed data when the tip probe is momentarily inconclusive", async () => {
  const source = new FakeSourceClient(); chainOf(3, source);
  await createIngestor({ db: db(), source, config: cfg(), logger: noopLogger }).runCycle();
  expect(await getMaxBlockNum(db())).toBe(3);

  // Source still claims height 3 but returns nothing for the tip probe (blip).
  const flaky = {
    getLatestBlock: () => source.getLatestBlock(),
    getBlockRange: (s: number, e: number) => (s === 3 && e === 3 ? Promise.resolve([]) : source.getBlockRange(s, e)),
    getTransactionsByHash: (h: string[]) => source.getTransactionsByHash(h),
    getCirculatingSupply: () => source.getCirculatingSupply(),
    getTotalSupply: () => source.getTotalSupply(),
  };
  const res = await createIngestor({ db: db(), source: flaky, config: cfg(), logger: noopLogger }).runCycle();
  expect(res.caughtUp).toBe(true);
  expect(await getMaxBlockNum(db())).toBe(3); // untouched, no destructive wipe
});

it("reports processedTo as the last block actually returned, not the requested top", async () => {
  const source = new FakeSourceClient(); chainOf(5, source);
  // Source claims tip 5 but serves only blocks 0..3 this cycle (short range).
  const short = {
    getLatestBlock: () => source.getLatestBlock(),
    getBlockRange: (s: number, e: number) => source.getBlockRange(s, Math.min(e, 3)),
    getTransactionsByHash: (h: string[]) => source.getTransactionsByHash(h),
    getCirculatingSupply: () => source.getCirculatingSupply(),
    getTotalSupply: () => source.getTotalSupply(),
  };
  const res = await createIngestor({ db: db(), source: short, config: cfg(), logger: noopLogger }).runCycle();
  expect(res.processedTo).toBe(3); // not the requested 5
  expect(await getMaxBlockNum(db())).toBe(3);
});

it("halts with ContinuityError on a previous_hash mismatch", async () => {
  const source = new FakeSourceClient(); chainOf(1, source);
  // corrupt block 1 to point at a wrong previous hash
  source.addBlock("H1", buildBlock({ num: 1, hash: "H1", previousHash: "WRONG", miningTxHash: "cb1", txHashes: ["t1"] }));
  const ing = createIngestor({ db: db(), source, config: cfg(), logger: noopLogger });
  await expect(ing.runCycle()).rejects.toBeInstanceOf(ContinuityError);
  expect(await getMaxBlockNum(db())).toBe(0); // block 0 committed, block 1 rejected
});

it("aborts a block (no partial persist) when a required tx is missing from the source", async () => {
  const source = new FakeSourceClient(); chainOf(1, source);
  // block 1 references a tx the source never returns (and which is not skipped)
  source.addBlock("H1", buildBlock({ num: 1, hash: "H1", previousHash: "H0", miningTxHash: "cbH1", txHashes: ["GONE"] }));
  const ing = createIngestor({ db: db(), source, config: cfg(), logger: noopLogger });
  await expect(ing.runCycle()).rejects.toBeInstanceOf(MissingTransactionError);
  expect(await getMaxBlockNum(db())).toBe(0); // block 0 committed, block 1 not persisted
});

it("skips an intentionally-skipped tx that the source omits, without aborting", async () => {
  const source = new FakeSourceClient(); chainOf(0, source);
  // block 1 references a skipped hash the source omits, plus its normal coinbase.
  source.addBlock("H1", buildBlock({ num: 1, hash: "H1", previousHash: "H0", miningTxHash: "cbH1", txHashes: ["SKIPME"] }));
  source.addTx("cbH1", buildTokenTx([{ address: "M", amount: 50 }]));
  const config = loadConfig({
    DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", INDEXER_MAX_BLOCK_RANGE: "10",
    INDEXER_SKIP_TX_HASHES: "SKIPME",
  });
  const ing = createIngestor({ db: db(), source, config, logger: noopLogger });
  await ing.runCycle();
  expect(await getMaxBlockNum(db())).toBe(1); // block 1 persisted; skipped tx simply not inserted
});
