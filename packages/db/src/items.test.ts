import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "./client.js";
import {
  block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply,
} from "./schema.js";
import { getItem, getItems, getItemHolders, getItemTransfers, getAddressItems } from "./items.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@localhost:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;

const ALPHA_META = '{"title":"Alpha","note":"50%_off"}';

interface SeedOut { to: string; amount: string; item?: string | null; meta?: string; token?: boolean }
interface SeedTx {
  hash: string; block: string; druid?: string;
  ins?: { prev: string; n: number; from: string }[];
  outs: SeedOut[];
}

// `item: null` marks a creation output (no genesis hash on chain); `item: "x"`
// is a transfer of item x. Insert order matters: ids break ties within a block.
const SEED: SeedTx[] = [
  // it_a: 3 units created to A, later split so B holds 2 (in two outputs) and A holds 1.
  { hash: "it_a", block: "ib1", outs: [{ to: "A", amount: "3", item: null, meta: ALPHA_META }] },
  {
    hash: "xf_1", block: "ib2", druid: "DRUID0xit", ins: [{ prev: "it_a", n: 0, from: "A" }],
    outs: [{ to: "B", amount: "2", item: "it_a" }, { to: "A", amount: "1", item: "it_a" }],
  },
  // it_b: never transferred, no metadata.
  { hash: "it_b", block: "ib2", outs: [{ to: "C", amount: "1", item: null }] },
  {
    hash: "xf_2", block: "ib3", ins: [{ prev: "xf_1", n: 0, from: "B" }],
    outs: [{ to: "B", amount: "1", item: "it_a" }, { to: "B", amount: "1", item: "it_a" }],
  },
  // it_c: metadata that is not JSON.
  { hash: "it_c", block: "ib3", outs: [{ to: "C", amount: "1", item: null, meta: "not json <b>x</b>" }] },
  // A transfer whose create transaction is not indexed.
  { hash: "orphan_xf", block: "ib3", outs: [{ to: "D", amount: "1", item: "missing_create" }] },
  { hash: "plain", block: "ib3", outs: [{ to: "P", amount: "5", token: true }] },
];

beforeAll(async () => {
  handle = createDb(URL);
  for (const t of [txInExpanded, txIn, txOut, transaction, coinsHistory, circulatingSupply, block]) {
    await db().delete(t);
  }
  await db().insert(block).values([
    { version: 1, num: 1, hash: "ib1", timestamp: new Date("2024-02-01T00:00:00Z"), nbTx: 1 },
    { version: 1, num: 2, hash: "ib2", previousHash: "ib1", timestamp: new Date("2024-02-02T00:00:00Z"), nbTx: 2 },
    { version: 1, num: 3, hash: "ib3", previousHash: "ib2", timestamp: new Date("2024-02-03T00:00:00Z"), nbTx: 4 },
  ]);
  for (const t of SEED) {
    const [row] = await db().insert(transaction).values({
      hash: t.hash, blockHash: t.block, version: 1, coinbase: false, druid: t.druid ?? null,
    }).returning({ id: transaction.id });
    const txId = row!.id;
    for (const [n, o] of t.outs.entries()) {
      await db().insert(txOut).values(o.token
        ? { txId, txHash: t.hash, valueType: "token", amount: o.amount, locktime: "0", scriptPublicKey: o.to, n }
        : {
          txId, txHash: t.hash, valueType: "item", amount: o.amount, locktime: "0", scriptPublicKey: o.to, n,
          genesisHash: o.item ?? null, itemGenesis: o.item ?? t.hash, itemMetadata: o.meta ?? null,
        });
    }
    for (const i of t.ins ?? []) {
      const common = { txId, txHash: t.hash, scriptSignature: {}, previousOutTxHash: i.prev, previousOutTxN: i.n };
      await db().insert(txIn).values(common);
      await db().insert(txInExpanded).values({ ...common, outScriptPublicKey: i.from });
    }
  }
});

afterAll(async () => { await handle.close(); });

describe("getItem", () => {
  it("returns an item's creation facts and how many addresses hold it", async () => {
    expect(await getItem(db(), "it_a")).toEqual({
      genesisHash: "it_a", metadata: ALPHA_META, totalAmount: "3", creator: "A",
      blockNum: 1, blockHash: "ib1", timestamp: new Date("2024-02-01T00:00:00Z"),
      holderCount: 2, // B holds it in two outputs but is one holder
    });
    expect(await getItem(db(), "it_b")).toMatchObject({ metadata: null, totalAmount: "1", creator: "C", holderCount: 1 });
  });

  it("returns null for anything that is not a create transaction", async () => {
    expect(await getItem(db(), "plain")).toBeNull(); // an ordinary transaction
    expect(await getItem(db(), "xf_1")).toBeNull(); // a transfer
    expect(await getItem(db(), "missing_create")).toBeNull(); // create transaction not indexed
    expect(await getItem(db(), "nope")).toBeNull();
  });
});

describe("getItems", () => {
  it("lists one row per item, newest first", async () => {
    const all = await getItems(db(), { limit: 10 });
    expect(all.items.map((i) => [i.genesisHash, i.totalAmount, i.holderCount, i.blockNum])).toEqual([
      ["it_c", "1", 1, 3], ["it_b", "1", 1, 2], ["it_a", "3", 2, 1],
    ]);
    expect(all.pagination).toMatchObject({ total: 3, limit: 10, offset: 0, hasMore: false });
  });

  it("pages", async () => {
    const page = await getItems(db(), { limit: 1, offset: 1 });
    expect(page.items.map((i) => i.genesisHash)).toEqual(["it_b"]);
    expect(page.pagination).toMatchObject({ total: 3, hasMore: true });
  });

  it("filters by a case-insensitive metadata substring", async () => {
    const res = await getItems(db(), { q: "ALPHA" });
    expect(res.items.map((i) => i.genesisHash)).toEqual(["it_a"]);
    expect(res.pagination.total).toBe(1);
    expect((await getItems(db(), { q: "zzz" })).items).toEqual([]);
  });

  it("treats LIKE metacharacters in the search literally", async () => {
    expect((await getItems(db(), { q: "50%_off" })).items).toHaveLength(1);
    expect((await getItems(db(), { q: "5%f" })).items).toHaveLength(0); // % is not a wildcard
    expect((await getItems(db(), { q: "50_" })).items).toHaveLength(0); // _ is not a wildcard
  });
});

describe("getItemHolders", () => {
  it("sums each holder's unspent outputs, largest first", async () => {
    const res = await getItemHolders(db(), "it_a", {});
    expect(res.holders).toEqual([{ address: "B", amount: "2" }, { address: "A", amount: "1" }]);
    expect(res.pagination).toMatchObject({ total: 2, hasMore: false });
  });

  it("pages by holder", async () => {
    const res = await getItemHolders(db(), "it_a", { limit: 1, offset: 1 });
    expect(res.holders).toEqual([{ address: "A", amount: "1" }]);
    expect((await getItemHolders(db(), "it_a", { limit: 1 })).pagination).toMatchObject({ total: 2, hasMore: true });
  });

  it("is empty for an unknown item", async () => {
    expect(await getItemHolders(db(), "nope", {})).toEqual({
      holders: [], pagination: { total: 0, limit: 25, offset: 0, hasMore: false },
    });
  });
});

describe("getItemTransfers", () => {
  it("lists every transaction that moved the item, newest first, ending with its creation", async () => {
    const { transfers, pagination } = await getItemTransfers(db(), "it_a", {});
    expect(transfers.map((t) => [t.txHash, t.blockNum, t.created, t.from, t.to.map((o) => [o.address, o.amount]), t.druid])).toEqual([
      ["xf_2", 3, false, ["B"], [["B", "1"], ["B", "1"]], null],
      ["xf_1", 2, false, ["A"], [["B", "2"], ["A", "1"]], "DRUID0xit"],
      ["it_a", 1, true, [], [["A", "3"]], null],
    ]);
    expect(transfers[0]).toMatchObject({ blockHash: "ib3", timestamp: new Date("2024-02-03T00:00:00Z") });
    expect(pagination).toMatchObject({ total: 3, hasMore: false });
  });

  it("pages", async () => {
    const res = await getItemTransfers(db(), "it_a", { limit: 1, offset: 1 });
    expect(res.transfers.map((t) => t.txHash)).toEqual(["xf_1"]);
    expect(res.pagination).toMatchObject({ total: 3, hasMore: true });
  });

  it("still lists transfers when the create transaction is not indexed", async () => {
    const { transfers } = await getItemTransfers(db(), "missing_create", {});
    expect(transfers.map((t) => [t.txHash, t.created, t.from])).toEqual([["orphan_xf", false, []]]);
  });
});

describe("getAddressItems", () => {
  it("lists the items an address currently holds, with the item's metadata", async () => {
    expect((await getAddressItems(db(), "C", {})).items).toEqual([
      { genesisHash: "it_b", amount: "1", metadata: null },
      { genesisHash: "it_c", amount: "1", metadata: "not json <b>x</b>" },
    ]);
    expect((await getAddressItems(db(), "B", {})).items).toEqual([
      { genesisHash: "it_a", amount: "2", metadata: ALPHA_META },
    ]);
    // A gave 2 of its 3 units away and holds the 1 it kept.
    expect((await getAddressItems(db(), "A", {})).items).toEqual([
      { genesisHash: "it_a", amount: "1", metadata: ALPHA_META },
    ]);
  });

  it("keeps an item whose create transaction is not indexed, without metadata", async () => {
    expect((await getAddressItems(db(), "D", {})).items).toEqual([
      { genesisHash: "missing_create", amount: "1", metadata: null },
    ]);
  });

  it("pages and is empty for an address holding nothing", async () => {
    const page = await getAddressItems(db(), "C", { limit: 1, offset: 1 });
    expect(page.items.map((i) => i.genesisHash)).toEqual(["it_c"]);
    expect(page.pagination).toMatchObject({ total: 2, hasMore: false });
    expect((await getAddressItems(db(), "P", {})).pagination.total).toBe(0);
  });
});
