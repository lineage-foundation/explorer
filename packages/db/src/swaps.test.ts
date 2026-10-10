import { describe, it, expect } from "vitest";
import { buildSwap, type SwapHalf } from "./swaps.js";

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
