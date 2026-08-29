import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "./client.js";
import { block, transaction, txIn, txOut, coinsHistory, circulatingSupply } from "./schema.js";
import {
  getBlocks, getBlocksCount, getBlockByHashOrNumber, getBlockTransactions,
  getTransactions, getTransactionsCount, getTransactionByHash,
  getAccountBalance, getAccountTransactions, getCirculatingSupply,
  getMaxBlockNum, getBlockHashByNum, getLatestCoinsHistoryOutIds,
} from "./queries.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@localhost:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;

beforeAll(async () => {
  handle = createDb(URL);
  await db().delete(txIn);
  await db().delete(txOut);
  await db().delete(transaction);
  await db().delete(coinsHistory);
  await db().delete(circulatingSupply);
  await db().delete(block);

  await db().insert(block).values([
    { version: 1, num: 1, hash: "b_hash_1", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1 },
    { version: 1, num: 2, hash: "b_hash_2", previousHash: "b_hash_1", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1 },
  ]);
  await db().insert(transaction).values([
    { hash: "tx_1", blockHash: "b_hash_1", version: 1, coinbase: false },
    { hash: "tx_cb", blockHash: "b_hash_2", version: 1, coinbase: true },
  ]);
  await db().insert(txOut).values([
    { txId: 1, txHash: "tx_1", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr_1", n: 0 },
  ]);
  await db().insert(txIn).values([{ txId: 1, txHash: "tx_1", scriptSignature: {} }]);
  await db().insert(circulatingSupply).values([{ id: 1, circulatingSupply: "12345" }]);
});

afterAll(async () => { await handle.close(); });

describe("read queries", () => {
  it("lists blocks newest-first with pagination", async () => {
    const res = await getBlocks(db(), { limit: 10, offset: 0, order: "desc" });
    expect(res.blocks[0]?.num).toBe(2);
    expect(res.pagination.total).toBe(2);
    expect(res.pagination.hasMore).toBe(false);
  });

  it("reports hasMore when more blocks remain beyond the page", async () => {
    const res = await getBlocks(db(), { limit: 1, offset: 0, order: "desc" });
    expect(res.pagination.hasMore).toBe(true);
  });

  it("counts blocks", async () => {
    expect(await getBlocksCount(db())).toBe(2);
  });

  it("finds a block by number or hash", async () => {
    expect((await getBlockByHashOrNumber(db(), "1"))?.hash).toBe("b_hash_1");
    expect((await getBlockByHashOrNumber(db(), "b_hash_2"))?.num).toBe(2);
    expect(await getBlockByHashOrNumber(db(), "b_hash_missing")).toBeNull();
  });

  it("returns a block's non-coinbase transactions with first-output type", async () => {
    const res = await getBlockTransactions(db(), "1");
    expect(res?.transactions).toHaveLength(1);
    expect(res?.transactions[0]?.txType).toBe("token");
  });

  it("lists transactions excluding coinbase", async () => {
    const res = await getTransactions(db(), { limit: 10, offset: 0, order: "desc" });
    expect(res.transactions.map((t) => t.hash)).toEqual(["tx_1"]);
    expect(res.pagination.total).toBe(1);
  });

  it("counts all transactions including coinbase", async () => {
    expect(await getTransactionsCount(db())).toBe(2);
  });

  it("returns full transaction detail or null", async () => {
    const tx = await getTransactionByHash(db(), "tx_1");
    expect(tx?.outs[0]?.amount).toBe("500");
    expect(await getTransactionByHash(db(), "nope")).toBeNull();
  });

  it("computes account balance from unspent outputs", async () => {
    await db().insert(coinsHistory).values([
      { address: "addr_1", date: new Date("2024-01-03T00:00:00Z"), outIds: [1] },
    ]);
    expect((await getAccountBalance(db(), "addr_1")).balance).toBe("500");
    expect((await getAccountBalance(db(), "unknown")).balance).toBe("0");
  });

  it("returns circulating supply", async () => {
    expect((await getCirculatingSupply(db())).circulatingSupply).toBe("12345");
  });

  it("returns an account's transactions joined via address outputs", async () => {
    const res = await getAccountTransactions(db(), "addr_1", { limit: 25, offset: 0 });
    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0]?.hash).toBe("tx_1");
    expect(res.pagination.total).toBe(1);
    expect(res.transactions[0]?.outs[0]?.amount).toBe("500");
  });

  it("returns no transactions for an unknown address", async () => {
    const res = await getAccountTransactions(db(), "unknown", { limit: 25, offset: 0 });
    expect(res.transactions).toEqual([]);
    expect(res.pagination).toEqual({ total: 0, limit: 25, offset: 0, hasMore: false });
  });

  it("paginates an account's transactions", async () => {
    const res = await getAccountTransactions(db(), "addr_1", { limit: 1, offset: 0 });
    expect(res.transactions).toHaveLength(1);
    expect(res.pagination.hasMore).toBe(false);
  });

  it("returns the max block num and a block hash by num", async () => {
    expect(await getMaxBlockNum(db())).toBe(2);
    expect(await getBlockHashByNum(db(), 1)).toBe("b_hash_1");
    expect(await getBlockHashByNum(db(), 999)).toBeNull();
  });

  it("returns latest coins_history outIds for an address (empty if none)", async () => {
    expect(await getLatestCoinsHistoryOutIds(db(), "addr_1")).toEqual([1]);
    expect(await getLatestCoinsHistoryOutIds(db(), "nobody")).toEqual([]);
  });

  it("breaks coins_history date ties by id (newest row wins)", async () => {
    const d = new Date("2024-06-01T00:00:00Z");
    await db().insert(coinsHistory).values([
      { address: "tie", date: d, outIds: [11] },
      { address: "tie", date: d, outIds: [22] },
    ]);
    expect(await getLatestCoinsHistoryOutIds(db(), "tie")).toEqual([22]);
  });
});
