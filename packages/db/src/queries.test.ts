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
  getBlockCoinbaseInfo, searchItems, deleteFromHeight, coinsHistoryHasNullBlockNum,
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

  it("does not resolve a malformed id to a truncated block number", async () => {
    // "1abc" must be treated as a (missing) hash, not parseInt'd to block 1.
    expect(await getBlockByHashOrNumber(db(), "1abc")).toBeNull();
    expect(await getBlockByHashOrNumber(db(), "1e2")).toBeNull();
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

  it("transaction value is the net sent, excluding change back to the sender", async () => {
    // nv1 is funded by addr_S; it pays 3 to addr_R and returns 35 change to
    // addr_S. Value must be the net transferred (3), not the gross 38.
    await db().insert(block).values({ version: 1, num: 700, hash: "nvb", timestamp: new Date("2024-09-01T00:00:00Z"), nbTx: 1 });
    await db().insert(transaction).values({ hash: "nv1", blockHash: "nvb", version: 1, coinbase: false });
    await db().insert(txOut).values([
      { txId: 0, txHash: "nv1", valueType: "token", amount: "35", locktime: "0", scriptPublicKey: "addr_S", n: 0 }, // change
      { txId: 0, txHash: "nv1", valueType: "token", amount: "3", locktime: "0", scriptPublicKey: "addr_R", n: 1 },  // sent
    ]);
    await db().insert(txIn).values({ txId: 0, txHash: "nv1", scriptSignature: {}, previousOutTxHash: "prev", previousOutTxN: 0 });
    await db().insert(txInExpanded).values({ txId: 0, txHash: "nv1", scriptSignature: {}, previousOutTxHash: "prev", previousOutTxN: 0, outScriptPublicKey: "addr_S" });
    try {
      const res = await getTransactions(db(), { limit: 100, offset: 0, order: "desc" });
      expect(res.transactions.find((t) => t.hash === "nv1")?.value).toBe("3");
    } finally {
      await db().delete(txInExpanded).where(eq(txInExpanded.txHash, "nv1"));
      await db().delete(txIn).where(eq(txIn.txHash, "nv1"));
      await db().delete(txOut).where(eq(txOut.txHash, "nv1"));
      await db().delete(transaction).where(eq(transaction.hash, "nv1"));
      await db().delete(block).where(eq(block.hash, "nvb"));
    }
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

  it("clamps out-of-range pagination instead of letting Postgres throw", async () => {
    const res = await getBlocks(db(), { limit: -5, offset: -10 });
    expect(res.pagination.limit).toBe(1); // negative limit clamped up
    expect(res.pagination.offset).toBe(0); // negative offset clamped up
    expect(res.blocks.length).toBeLessThanOrEqual(1);
  });

  it("searches item outputs by metadata substring, genesis class, and spent status", async () => {
    await db().insert(block).values({
      version: 1, num: 800, hash: "ib", timestamp: new Date("2024-07-01T00:00:00Z"), nbTx: 6,
    });
    await db().insert(transaction).values(
      ["im1", "im2", "im3", "im4", "im5", "spend1"].map((hash) => ({ hash, blockHash: "ib", version: 1, coinbase: false })),
    );
    const item = (txHash: string, genesisHash: string, itemMetadata: string, address: string) => ({
      txId: 0, txHash, valueType: "item", amount: "1", locktime: "0", genesisHash,
      scriptPublicKey: address, itemMetadata, n: 0,
    });
    await db().insert(txOut).values([
      item("im1", "gen_A", '{"name":"Sword","power":9}', "owner1"), // spent below
      item("im2", "gen_B", "a rare dragon egg", "owner2"),
      item("im3", "gen_A", "Sword shard", "owner3"),
      item("im4", "gen_C", "buy 50% now", "owner4"),
      item("im5", "gen_C", "buy 5000 now", "owner5"),
    ]);
    await db().insert(txIn).values({ txId: 0, txHash: "spend1", previousOutTxHash: "im1", previousOutTxN: 0, scriptSignature: {} });
    try {
      // case-insensitive substring, ordered newest block then id desc (im3 after im1)
      const bySword = await searchItems(db(), { q: "sword", limit: 25, offset: 0 });
      expect(bySword.items.map((i) => i.txHash)).toEqual(["im3", "im1"]);
      expect(bySword.items.every((i) => i.genesisHash === "gen_A")).toBe(true);
      // spent status: im1 has been spent, im3 has not
      expect(bySword.items.find((i) => i.txHash === "im1")?.spent).toBe(true);
      expect(bySword.items.find((i) => i.txHash === "im3")?.spent).toBe(false);
      expect(bySword.items.find((i) => i.txHash === "im3")?.address).toBe("owner3");

      // exact genesis class filter
      const genB = await searchItems(db(), { genesis: "gen_B" });
      expect(genB.items.map((i) => i.txHash)).toEqual(["im2"]);
      expect(genB.items[0]?.metadata).toBe("a rare dragon egg");

      // combined, case-insensitive
      expect((await searchItems(db(), { q: "DRAGON", genesis: "gen_B" })).items).toHaveLength(1);
      expect((await searchItems(db(), { q: "sword", genesis: "gen_A" })).items).toHaveLength(2);

      // LIKE metacharacters in q are escaped: "50%" matches the literal, not a wildcard
      const pct = await searchItems(db(), { q: "50%" });
      expect(pct.items.map((i) => i.txHash)).toEqual(["im4"]);

      // no match
      expect((await searchItems(db(), { q: "zzz-nomatch" })).pagination.total).toBe(0);

      // pagination + tiebreaker
      const page1 = await searchItems(db(), { q: "sword", limit: 1, offset: 0 });
      expect(page1.items.map((i) => i.txHash)).toEqual(["im3"]);
      expect(page1.pagination).toMatchObject({ total: 2, limit: 1, offset: 0, hasMore: true });
    } finally {
      await db().delete(txIn).where(eq(txIn.txHash, "spend1"));
      await db().delete(txOut).where(inArray(txOut.txHash, ["im1", "im2", "im3", "im4", "im5"]));
      await db().delete(transaction).where(inArray(transaction.hash, ["im1", "im2", "im3", "im4", "im5", "spend1"]));
      await db().delete(block).where(eq(block.hash, "ib"));
    }
  });

  it("deleteFromHeight removes only blocks above the fork and their dependent rows", async () => {
    const nums = [10, 11, 12];
    await db().insert(block).values(nums.map((n) => ({
      version: 1, num: n, hash: `df${n}`, timestamp: new Date(`2024-08-${n}T00:00:00Z`), nbTx: 1,
    })));
    await db().insert(transaction).values(nums.map((n) => ({ hash: `dftx${n}`, blockHash: `df${n}`, version: 1, coinbase: false })));
    await db().insert(txOut).values(nums.map((n) => ({ txId: 0, txHash: `dftx${n}`, valueType: "token", amount: "1", locktime: "0", scriptPublicKey: "dfaddr", n: 0 })));
    await db().insert(txIn).values(nums.map((n) => ({ txId: 0, txHash: `dftx${n}`, scriptSignature: {} })));
    await db().insert(coinsHistory).values(nums.map((n) => ({ address: "dfaddr", date: new Date(`2024-08-${n}T00:00:00Z`), blockNum: n, outIds: [n] })));
    try {
      await deleteFromHeight(db(), 10); // keep 10, drop 11 and 12
      const blocksLeft = await db().select().from(block).where(inArray(block.hash, ["df10", "df11", "df12"]));
      expect(blocksLeft.map((b) => b.num)).toEqual([10]);
      const txsLeft = await db().select().from(transaction).where(inArray(transaction.hash, ["dftx10", "dftx11", "dftx12"]));
      expect(txsLeft.map((t) => t.hash)).toEqual(["dftx10"]);
      expect(await db().select().from(txOut).where(inArray(txOut.txHash, ["dftx11", "dftx12"]))).toHaveLength(0);
      expect(await db().select().from(txIn).where(inArray(txIn.txHash, ["dftx11", "dftx12"]))).toHaveLength(0);
      const chLeft = await db().select().from(coinsHistory).where(eq(coinsHistory.address, "dfaddr"));
      expect(chLeft.map((c) => c.blockNum)).toEqual([10]);
    } finally {
      await db().delete(txIn).where(inArray(txIn.txHash, ["dftx10", "dftx11", "dftx12"]));
      await db().delete(txOut).where(inArray(txOut.txHash, ["dftx10", "dftx11", "dftx12"]));
      await db().delete(transaction).where(inArray(transaction.hash, ["dftx10", "dftx11", "dftx12"]));
      await db().delete(coinsHistory).where(eq(coinsHistory.address, "dfaddr"));
      await db().delete(block).where(inArray(block.hash, ["df10", "df11", "df12"]));
    }
  });

  it("coinsHistoryHasNullBlockNum flags legacy untagged snapshots", async () => {
    // Runs last: a clean slate for a global check (no later test needs coins_history).
    await db().delete(coinsHistory);
    expect(await coinsHistoryHasNullBlockNum(db())).toBe(false);
    await db().insert(coinsHistory).values({ address: "tagged", date: new Date("2024-01-01T00:00:00Z"), blockNum: 5, outIds: [] });
    expect(await coinsHistoryHasNullBlockNum(db())).toBe(false);
    await db().insert(coinsHistory).values({ address: "legacy", date: new Date("2024-01-02T00:00:00Z"), outIds: [] });
    expect(await coinsHistoryHasNullBlockNum(db())).toBe(true);
    await db().delete(coinsHistory);
  });
});
