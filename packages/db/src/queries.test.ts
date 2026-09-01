import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createDb, type Database } from "./client.js";
import {
  block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply,
} from "./schema.js";
import {
  getBlocks, getBlocksCount, getBlockByHashOrNumber, getBlockTransactions,
  getTransactions, getTransactionsCount, getTransactionByHash,
  getAccountBalance, getAccountTransactions, getCirculatingSupply,
  getMaxBlockNum, getBlockHashByNum, getLatestCoinsHistoryOutIds, searchByPrefix,
  getBlockCoinbaseInfo,
} from "./queries.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@localhost:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;

beforeAll(async () => {
  handle = createDb(URL);
  await db().delete(txInExpanded);
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
    { hash: "tx_2", blockHash: "b_hash_2", version: 1, coinbase: false },
  ]);
  await db().insert(txOut).values([
    { txId: 1, txHash: "tx_1", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr_1", n: 0 },
    { txId: 2, txHash: "tx_cb", valueType: "token", amount: "1000", locktime: "0", scriptPublicKey: "miner", n: 0 },
  ]);
  await db().insert(txIn).values([
    { txId: 1, txHash: "tx_1", scriptSignature: {} },
    {
      txId: 3, txHash: "tx_2", scriptSignature: {},
      previousOutTxHash: "tx_1", previousOutTxN: 0,
    },
  ]);
  await db().insert(txInExpanded).values([
    {
      txId: 3, txHash: "tx_2", scriptSignature: {},
      previousOutTxHash: "tx_1", previousOutTxN: 0, outScriptPublicKey: "addr_1",
    },
  ]);
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

  it("includes each block's coinbase reward and miner", async () => {
    const res = await getBlocks(db(), { limit: 10, offset: 0, order: "desc" });
    const b2 = res.blocks.find((b) => b.num === 2);
    const b1 = res.blocks.find((b) => b.num === 1);
    expect(b2?.reward).toBe("1000"); // block 2 coinbase tx_cb (1000)
    expect(b2?.miner).toBe("miner"); // tx_cb output scriptPublicKey
    expect(b1?.reward).toBeNull(); // block 1 has no coinbase output
    expect(b1?.miner).toBeNull();
  });

  it("returns a block's coinbase reward and miner, or nulls", async () => {
    expect(await getBlockCoinbaseInfo(db(), "b_hash_2")).toEqual({ reward: "1000", miner: "miner" });
    expect(await getBlockCoinbaseInfo(db(), "b_hash_1")).toEqual({ reward: null, miner: null });
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

  it("returns a block's transactions with first-output type", async () => {
    const res = await getBlockTransactions(db(), "1");
    expect(res?.transactions).toHaveLength(1);
    expect(res?.transactions[0]?.txType).toBe("token");
    expect(res?.transactions[0]?.coinbase).toBe(false);
  });

  it("includes the coinbase transaction, ordered first", async () => {
    const res = await getBlockTransactions(db(), "2");
    expect(res?.transactions.map((t) => t.hash)).toEqual(["tx_cb", "tx_2"]);
    expect(res?.transactions[0]?.coinbase).toBe(true);
    expect(res?.transactions[1]?.coinbase).toBe(false);
  });

  it("lists transactions excluding coinbase with block number and total value", async () => {
    const res = await getTransactions(db(), { limit: 10, offset: 0, order: "desc" });
    expect(res.transactions.map((t) => t.hash)).toEqual(["tx_2", "tx_1"]);
    expect(res.pagination.total).toBe(2);
    const tx1 = res.transactions.find((t) => t.hash === "tx_1");
    expect(tx1?.blockNum).toBe(1);
    expect(tx1?.value).toBe("500"); // sum of tx_1 outputs
    expect(res.transactions.find((t) => t.hash === "tx_2")?.value).toBeNull(); // no outputs
  });

  it("counts non-coinbase transactions", async () => {
    expect(await getTransactionsCount(db())).toBe(2);
  });

  it("returns full transaction detail or null", async () => {
    const tx = await getTransactionByHash(db(), "tx_1");
    expect(tx?.outs[0]?.amount).toBe("500");
    expect(tx?.coinbase).toBe(false);
    expect(await getTransactionByHash(db(), "nope")).toBeNull();
  });

  it("resolves a spend transaction's input address and amount via tx_in_expanded", async () => {
    const tx = await getTransactionByHash(db(), "tx_2");
    expect(tx?.ins).toHaveLength(1);
    expect(tx?.ins[0]?.fromAddress).toBe("addr_1");
    expect(tx?.ins[0]?.amount).toBe("500");
    expect(tx?.ins[0]?.previousOutTxHash).toBe("tx_1");
    expect(tx?.ins[0]?.previousOutTxN).toBe(0);
  });

  it("leaves fromAddress and amount null for an unresolved input", async () => {
    const tx = await getTransactionByHash(db(), "tx_1");
    expect(tx?.ins[0]?.fromAddress).toBeNull();
    expect(tx?.ins[0]?.amount).toBeNull();
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

  it("includes coinbase (block-reward) transactions in an address's history", async () => {
    // tx_cb pays "miner" via a coinbase output; coinbase txs have no tx_in rows,
    // so an inner join on tx_in would silently hide every mining reward.
    const res = await getAccountTransactions(db(), "miner", { limit: 25, offset: 0 });
    expect(res.transactions.map((t) => t.hash)).toEqual(["tx_cb"]);
    expect(res.pagination.total).toBe(1);
  });

  it("paginates equal-block-number transactions deterministically (unique tiebreaker)", async () => {
    // Three non-coinbase txs in ONE block all pay the same address, so every row
    // shares b.num — without a unique ORDER BY tiebreaker their relative order is
    // unspecified and offset pagination can drop/duplicate rows across pages.
    await db().insert(block).values({
      version: 1, num: 900, hash: "tie_blk",
      timestamp: new Date("2024-06-01T00:00:00Z"), nbTx: 3,
    });
    await db().insert(transaction).values([
      { hash: "tie_a", blockHash: "tie_blk", version: 1, coinbase: false },
      { hash: "tie_b", blockHash: "tie_blk", version: 1, coinbase: false },
      { hash: "tie_c", blockHash: "tie_blk", version: 1, coinbase: false },
    ]); // serial ids assigned in array order: tie_a < tie_b < tie_c
    await db().insert(txOut).values([
      { txId: 0, txHash: "tie_a", valueType: "token", amount: "1", locktime: "0", scriptPublicKey: "tie_addr", n: 0 },
      { txId: 0, txHash: "tie_b", valueType: "token", amount: "1", locktime: "0", scriptPublicKey: "tie_addr", n: 0 },
      { txId: 0, txHash: "tie_c", valueType: "token", amount: "1", locktime: "0", scriptPublicKey: "tie_addr", n: 0 },
    ]);
    try {
      const p1 = await getAccountTransactions(db(), "tie_addr", { limit: 2, offset: 0 });
      const p2 = await getAccountTransactions(db(), "tie_addr", { limit: 2, offset: 2 });
      expect(p1.pagination.total).toBe(3);
      // deterministic: within equal b.num, order falls back to transaction.id desc
      expect(p1.transactions.map((t) => t.hash)).toEqual(["tie_c", "tie_b"]);
      expect(p2.transactions.map((t) => t.hash)).toEqual(["tie_a"]);
      // complete coverage across pages — no dropped or duplicated rows
      const seen = [...p1.transactions, ...p2.transactions].map((t) => t.hash);
      expect(new Set(seen)).toEqual(new Set(["tie_a", "tie_b", "tie_c"]));
      // the global transaction list applies the same tiebreaker (highest block first)
      const list = await getTransactions(db(), { limit: 3, offset: 0, order: "desc" });
      expect(list.transactions.map((t) => t.hash)).toEqual(["tie_c", "tie_b", "tie_a"]);
    } finally {
      await db().delete(txOut).where(inArray(txOut.txHash, ["tie_a", "tie_b", "tie_c"]));
      await db().delete(transaction).where(inArray(transaction.hash, ["tie_a", "tie_b", "tie_c"]));
      await db().delete(block).where(eq(block.hash, "tie_blk"));
    }
  });

  it("prefix-searches blocks, transactions, and addresses (escaping LIKE metachars)", async () => {
    // "b_hash" contains an underscore (a LIKE wildcard) — must be escaped to match literally.
    const byBlock = await searchByPrefix(db(), "b_hash", 10);
    expect(byBlock.blocks.map((b) => b.hash).sort()).toEqual(["b_hash_1", "b_hash_2"]);
    const byTx = await searchByPrefix(db(), "tx_", 10);
    expect(byTx.transactions.map((t) => t.hash).sort()).toEqual(["tx_1", "tx_2", "tx_cb"]);
    const byAddr = await searchByPrefix(db(), "addr", 10);
    expect(byAddr.addresses.map((a) => a.address)).toContain("addr_1");
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
