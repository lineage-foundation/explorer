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
});
