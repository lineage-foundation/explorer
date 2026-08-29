import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, type Database, schema, getBlocks, getMaxBlockNum } from "@explorer/db";
import { createIngestor, ContinuityError } from "../ingestor.js";
import { loadConfig } from "../config.js";
import { FakeSourceClient, buildBlock, buildTokenTx, buildSpendTx } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const noopLogger = { info: () => {}, error: () => {}, warn: () => {} };
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;
const cfg = () => loadConfig({ DATABASE_URL: URL, LINEAGE_STORAGE_NODE_URL: "x", INDEXER_MAX_BLOCK_RANGE: "10" });

function chainOf(n: number, source: FakeSourceClient) {
  let prev = "";
  for (let i = 0; i <= n; i++) {
    const hash = `H${i}`, cb = `cb${i}`, t = `t${i}`;
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

it("halts with ContinuityError on a previous_hash mismatch", async () => {
  const source = new FakeSourceClient(); chainOf(1, source);
  // corrupt block 1 to point at a wrong previous hash
  source.addBlock("H1", buildBlock({ num: 1, hash: "H1", previousHash: "WRONG", miningTxHash: "cb1", txHashes: ["t1"] }));
  const ing = createIngestor({ db: db(), source, config: cfg(), logger: noopLogger });
  await expect(ing.runCycle()).rejects.toBeInstanceOf(ContinuityError);
  expect(await getMaxBlockNum(db())).toBe(0); // block 0 committed, block 1 rejected
});
