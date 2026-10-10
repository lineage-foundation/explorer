import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "./client.js";
import {
  block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply,
} from "./schema.js";
import { buildSwap, getSwapByDruid, getSwapsByDruids, getSwaps, type SwapHalf } from "./swaps.js";

type In = { from: string | null; amount: string; kind?: "token" | "item"; genesis?: string };
type Out = { to: string; amount: string; kind?: "token" | "item"; genesis?: string };
type Expect = { to: string; token?: string; item?: { amount: string; genesis: string } };

function half(
  hash: string,
  spec: { ins: In[]; outs: Out[]; expects: Expect[]; blockNum?: number; participants?: number; druid?: string },
): SwapHalf {
  const blockNum = spec.blockNum ?? 2;
  return {
    hash, blockHash: `b${blockNum}`, blockNum, version: 2, coinbase: false, fees: null,
    timestamp: new Date(Date.UTC(2024, 0, blockNum)),
    druid: spec.druid ?? "D1",
    druidInfo: {
      druid: spec.druid ?? "D1",
      participants: spec.participants ?? 2,
      genesis_hash: null,
      expectations: spec.expects.map((e) => ({
        from: "hash-of-inputs-not-an-address",
        to: e.to,
        asset: e.item
          ? { Item: { amount: e.item.amount, genesis_hash: e.item.genesis, metadata: null } }
          : { Token: e.token },
      })),
    },
    ins: spec.ins.map((i, n) => ({
      scriptSignature: {}, previousOutTxHash: `prev_${hash}`, previousOutTxN: n,
      fromAddress: i.from, amount: i.amount,
      valueType: i.kind ?? "token", genesisHash: i.genesis ?? null,
    })),
    outs: spec.outs.map((o, n) => ({
      valueType: o.kind ?? "token", amount: o.amount, locktime: "0",
      genesisHash: o.genesis ?? null, scriptPublicKey: o.to, itemMetadata: null, n,
    })),
  };
}

// A gives item gen1 ×1 to B and expects 1000 tokens; B pays 1000 to A with
// 999000 change back to itself and expects the item.
const halfA = half("hA", {
  ins: [{ from: "A", amount: "1", kind: "item", genesis: "gen1" }],
  outs: [{ to: "B", amount: "1", kind: "item", genesis: "gen1" }],
  expects: [{ to: "A", token: "1000" }],
});
const halfB = half("hB", {
  ins: [{ from: "B", amount: "1000000" }],
  outs: [{ to: "A", amount: "1000" }, { to: "B", amount: "999000" }],
  expects: [{ to: "B", item: { amount: "1", genesis: "gen1" } }],
});

describe("buildSwap", () => {
  it("item-for-token: two met legs, change output excluded", () => {
    const s = buildSwap("D1", [halfA, halfB]);
    expect(s.complete).toBe(true);
    expect(s.participants).toBe(2);
    expect(s.txHashes).toEqual(["hA", "hB"]);
    expect(s.legs).toEqual([
      { from: ["B"], to: "A", asset: { kind: "token", amount: "1000", genesisHash: null, metadata: null }, txHash: "hB", met: true },
      { from: ["A"], to: "B", asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null }, txHash: "hA", met: true },
    ]);
  });

  it("takes block, hash and timestamp from the highest-numbered half", () => {
    const s = buildSwap("D1", [halfA, { ...halfB, blockNum: 5, blockHash: "b5", timestamp: new Date(Date.UTC(2024, 0, 5)) }]);
    expect(s.blockNum).toBe(5);
    expect(s.blockHash).toBe("b5");
    expect(s.timestamp).toEqual(new Date(Date.UTC(2024, 0, 5)));
  });

  it("identical assets on both legs match across halves, one output each", () => {
    const a = half("hA", {
      ins: [{ from: "A", amount: "500" }], outs: [{ to: "B", amount: "500" }], expects: [{ to: "A", token: "500" }],
    });
    const b = half("hB", {
      ins: [{ from: "B", amount: "500" }], outs: [{ to: "A", amount: "500" }], expects: [{ to: "B", token: "500" }],
    });
    const s = buildSwap("D1", [a, b]);
    expect(s.complete).toBe(true);
    expect(s.legs.map((l) => [l.from, l.to, l.txHash])).toEqual([[["B"], "A", "hB"], [["A"], "B", "hA"]]);
  });

  it("never satisfies an expectation with an output of the same half", () => {
    // A's own half pays A 1000 (e.g. change); B's half pays nothing to A.
    const a = half("hA", {
      ins: [{ from: "A", amount: "1000" }], outs: [{ to: "A", amount: "1000" }], expects: [{ to: "A", token: "1000" }],
    });
    const b = half("hB", { ins: [{ from: "B", amount: "1" }], outs: [{ to: "B", amount: "1" }], expects: [] });
    const s = buildSwap("D1", [a, b]);
    expect(s.legs).toEqual([expect.objectContaining({ to: "A", from: null, txHash: null, met: false })]);
    expect(s.complete).toBe(false);
  });

  it("does not let one output satisfy two expectations", () => {
    // Two halves each expect 500 to X, but only one such output exists.
    const a = half("hA", { ins: [{ from: "A", amount: "1" }], outs: [], expects: [{ to: "X", token: "500" }], participants: 3 });
    const b = half("hB", { ins: [{ from: "B", amount: "1" }], outs: [], expects: [{ to: "X", token: "500" }], participants: 3 });
    const c = half("hC", { ins: [{ from: "C", amount: "500" }], outs: [{ to: "X", amount: "500" }], expects: [], participants: 3 });
    const s = buildSwap("D1", [a, b, c]);
    expect(s.legs.map((l) => l.met)).toEqual([true, false]);
    expect(s.complete).toBe(false);
  });

  it("matches token amounts numerically, not as strings", () => {
    const a = half("hA", { ins: [{ from: "A", amount: "1" }], outs: [], expects: [{ to: "A", token: "0500" }] });
    const b = half("hB", { ins: [{ from: "B", amount: "500" }], outs: [{ to: "A", amount: "500" }], expects: [] });
    expect(buildSwap("D1", [a, b]).legs[0]?.met).toBe(true);
  });

  it("requires the same genesis hash for an item", () => {
    const b = half("hB", {
      ins: [{ from: "B", amount: "1000000" }], outs: [{ to: "A", amount: "1000" }],
      expects: [{ to: "B", item: { amount: "1", genesis: "other" } }],
    });
    const s = buildSwap("D1", [halfA, b]);
    expect(s.legs.find((l) => l.to === "B")).toMatchObject({ met: false, from: null });
  });

  it("missing half: unmet leg, incomplete", () => {
    const s = buildSwap("D1", [halfA]);
    expect(s.complete).toBe(false);
    expect(s.legs).toEqual([expect.objectContaining({ from: null, txHash: null, met: false, to: "A" })]);
  });

  it("reused druid: more halves than participants renders incomplete", () => {
    const a2 = { ...halfA, hash: "hA2", blockNum: 9, blockHash: "b9" };
    const b2 = { ...halfB, hash: "hB2", blockNum: 9, blockHash: "b9" };
    const s = buildSwap("D1", [halfA, halfB, a2, b2]);
    expect(s.complete).toBe(false);
    expect(s.txHashes).toEqual(["hA", "hB", "hA2", "hB2"]);
    expect(s.legs).toHaveLength(4);
    expect(s.blockNum).toBe(9);
  });

  it("unresolved inputs give an empty party", () => {
    const b = { ...halfB, ins: halfB.ins.map((i) => ({ ...i, fromAddress: null })) };
    const s = buildSwap("D1", [halfA, b]);
    expect(s.legs.find((l) => l.to === "A")).toMatchObject({ from: [], met: true, txHash: "hB" });
  });

  it("a party lists each input address once, in first-seen order", () => {
    const b = half("hB", {
      ins: [{ from: "B2", amount: "600" }, { from: "B1", amount: "300" }, { from: "B2", amount: "100" }],
      outs: [{ to: "A", amount: "1000" }],
      expects: [{ to: "B2", item: { amount: "1", genesis: "gen1" } }],
    });
    const s = buildSwap("D1", [halfA, b]);
    expect(s.legs.find((l) => l.to === "A")?.from).toEqual(["B2", "B1"]);
  });

  it.each([
    null, "x", 7, { druid: "D1" }, { expectations: "no" }, { expectations: [{ to: 1 }] },
    { expectations: [{ to: "A", asset: { Token: {} } }] },
    { expectations: [{ to: "A", asset: { Item: { amount: "1" } } }] },
    { expectations: [null] },
  ])("malformed druidInfo %j: no legs, no throw", (info) => {
    const s = buildSwap("D1", [{ ...halfA, druidInfo: info }]);
    expect(s.legs).toEqual([]);
    expect(s.complete).toBe(false);
  });

  it("falls back to the number of halves when participants is not a positive integer", () => {
    const a = { ...halfA, druidInfo: { ...(halfA.druidInfo as object), participants: "two" } };
    const b = { ...halfB, druidInfo: { ...(halfB.druidInfo as object), participants: "two" } };
    expect(buildSwap("D1", [a, b]).participants).toBe(2);
  });

  it("accepts a numeric Token amount", () => {
    const a = { ...halfA, druidInfo: { participants: 2, expectations: [{ to: "A", asset: { Token: 1000 } }] } };
    expect(buildSwap("D1", [a, halfB]).legs.find((l) => l.to === "A")).toMatchObject({ met: true });
  });
});

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@localhost:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;

type SeedOut = { to: string; amount: string; kind?: "token" | "item"; genesis?: string };
type SeedIn = { prev: string; n: number; from: string };
interface SeedTx {
  hash: string; block: string; coinbase?: boolean; druid?: string; expects?: Expect[];
  ins?: SeedIn[]; outs: SeedOut[];
}

// Insert order is significant: transaction ids break ties within a block.
const SEED: SeedTx[] = [
  { hash: "tx_plain_1", block: "sb1", outs: [{ to: "B", amount: "1000000" }, { to: "A", amount: "1", kind: "item", genesis: "gen1" }] },
  // DRUID0xs1 — A's item for B's 1000 tokens. An unrelated transaction sits
  // between the two halves so their ids are not adjacent.
  {
    hash: "sA1", block: "sb2", druid: "DRUID0xs1", expects: [{ to: "A", token: "1000" }],
    ins: [{ prev: "tx_plain_1", n: 1, from: "A" }], outs: [{ to: "B", amount: "1", kind: "item", genesis: "gen1" }],
  },
  { hash: "tx_mid_2", block: "sb2", outs: [{ to: "M", amount: "300" }] },
  {
    hash: "sB1", block: "sb2", druid: "DRUID0xs1", expects: [{ to: "B", item: { amount: "1", genesis: "gen1" } }],
    ins: [{ prev: "tx_plain_1", n: 0, from: "B" }], outs: [{ to: "A", amount: "1000" }, { to: "B", amount: "999000" }],
  },
  { hash: "tx_plain_2", block: "sb2", outs: [{ to: "P", amount: "7" }] },
  { hash: "tx_cb_3", block: "sb3", coinbase: true, outs: [{ to: "miner", amount: "50" }] },
  // DRUID0xs2 — A's 400 tokens for M's 300 tokens.
  {
    hash: "sA2", block: "sb3", druid: "DRUID0xs2", expects: [{ to: "A", token: "300" }],
    ins: [{ prev: "sB1", n: 0, from: "A" }], outs: [{ to: "M", amount: "400" }, { to: "A", amount: "600" }],
  },
  {
    hash: "sB2", block: "sb3", druid: "DRUID0xs2", expects: [{ to: "M", token: "400" }],
    ins: [{ prev: "tx_mid_2", n: 0, from: "M" }], outs: [{ to: "A", amount: "300" }],
  },
  { hash: "tx_plain_3", block: "sb3", outs: [{ to: "P", amount: "9" }] },
];

describe("swap queries", () => {
  beforeAll(async () => {
    handle = createDb(URL);
    for (const t of [txInExpanded, txIn, txOut, transaction, coinsHistory, circulatingSupply, block]) {
      await db().delete(t);
    }
    await db().insert(block).values([
      { version: 1, num: 1, hash: "sb1", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1 },
      { version: 1, num: 2, hash: "sb2", previousHash: "sb1", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 4 },
      { version: 1, num: 3, hash: "sb3", previousHash: "sb2", timestamp: new Date("2024-01-03T00:00:00Z"), nbTx: 3 },
    ]);
    const outIds = new Map<string, number>();
    for (const t of SEED) {
      const [row] = await db().insert(transaction).values({
        hash: t.hash, blockHash: t.block, version: t.druid ? 2 : 1, coinbase: t.coinbase ?? false,
        druid: t.druid ?? null,
        druidInfo: t.druid
          ? {
            druid: t.druid, participants: 2, genesis_hash: null,
            expectations: (t.expects ?? []).map((e) => ({
              from: "hash-of-inputs",
              to: e.to,
              asset: e.item
                ? { Item: { amount: e.item.amount, genesis_hash: e.item.genesis, metadata: null } }
                : { Token: e.token },
            })),
          }
          : null,
      }).returning({ id: transaction.id });
      const txId = row!.id;
      for (const [n, o] of t.outs.entries()) {
        const [out] = await db().insert(txOut).values({
          txId, txHash: t.hash, valueType: o.kind ?? "token", amount: o.amount, locktime: "0",
          genesisHash: o.genesis ?? null, scriptPublicKey: o.to, n,
        }).returning({ id: txOut.id });
        outIds.set(`${t.hash}:${n}`, out!.id);
      }
      for (const i of t.ins ?? []) {
        const common = { txId, txHash: t.hash, scriptSignature: {}, previousOutTxHash: i.prev, previousOutTxN: i.n };
        await db().insert(txIn).values(common);
        await db().insert(txInExpanded).values({ ...common, outScriptPublicKey: i.from });
      }
    }
    // A's token balance: 1000 after block 2 (sB1:0), 900 after block 3 (sA2:1 + sB2:0).
    await db().insert(coinsHistory).values([
      { address: "A", date: new Date("2024-01-02T00:00:00Z"), blockNum: 2, outIds: [outIds.get("sB1:0")] },
      { address: "A", date: new Date("2024-01-03T00:00:00Z"), blockNum: 3, outIds: [outIds.get("sA2:1"), outIds.get("sB2:0")] },
    ]);
  });

  afterAll(async () => { await handle.close(); });

  it("getSwapByDruid returns the swap and both halves", async () => {
    const found = await getSwapByDruid(db(), "DRUID0xs1");
    expect(found?.swap).toMatchObject({
      druid: "DRUID0xs1", complete: true, blockNum: 2, blockHash: "sb2", participants: 2,
      txHashes: ["sA1", "sB1"],
    });
    expect(found?.swap.legs).toEqual([
      { from: ["B"], to: "A", asset: { kind: "token", amount: "1000", genesisHash: null, metadata: null }, txHash: "sB1", met: true },
      { from: ["A"], to: "B", asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null }, txHash: "sA1", met: true },
    ]);
    expect(found?.halves.map((h) => [h.hash, h.blockNum])).toEqual([["sA1", 2], ["sB1", 2]]);
  });

  it("getSwapByDruid returns null for an unknown druid", async () => {
    expect(await getSwapByDruid(db(), "nope")).toBeNull();
  });

  it("getSwapsByDruids loads several swaps and skips unknown druids", async () => {
    const map = await getSwapsByDruids(db(), ["DRUID0xs2", "nope", "DRUID0xs1"]);
    expect([...map.keys()].sort()).toEqual(["DRUID0xs1", "DRUID0xs2"]);
    expect(map.get("DRUID0xs2")?.swap.complete).toBe(true);
    expect((await getSwapsByDruids(db(), [])).size).toBe(0);
  });

  it("getSwaps pages distinct druids, newest settlement first", async () => {
    const first = await getSwaps(db(), { limit: 1, offset: 0 });
    expect(first.swaps.map((s) => s.druid)).toEqual(["DRUID0xs2"]);
    expect(first.pagination).toMatchObject({ total: 2, limit: 1, offset: 0, hasMore: true });
    const second = await getSwaps(db(), { limit: 1, offset: 1 });
    expect(second.swaps.map((s) => s.druid)).toEqual(["DRUID0xs1"]);
    expect(second.pagination.hasMore).toBe(false);
  });
});
