import { describe, it, expect } from "vitest";
import type { SwapLeg, TxDetail } from "@explorer/db";
import { formatLngx } from "../format.js";
import { netForAddress, swapLinesForAddress } from "../tx.js";

function tx(
  ins: { fromAddress: string | null; amount: string | null; valueType?: string }[],
  outs: { scriptPublicKey: string | null; amount: string | null; valueType?: string }[],
): TxDetail {
  return {
    blockHash: "b", hash: "h", version: 1, timestamp: null, coinbase: false, fees: null, druidInfo: null, druid: null,
    ins: ins.map((i) => ({ scriptSignature: {}, previousOutTxHash: null, previousOutTxN: null, fromAddress: i.fromAddress, amount: i.amount, valueType: i.valueType ?? "token", genesisHash: null })),
    outs: outs.map((o, n) => ({ valueType: o.valueType ?? "token", amount: o.amount, locktime: "0", genesisHash: null, scriptPublicKey: o.scriptPublicKey, itemMetadata: null, n, itemGenesis: null })),
  };
}

describe("netForAddress", () => {
  // Real shape: S sends; R receives 10; change goes to a fresh address C.
  const t = tx(
    [{ fromAddress: "S", amount: "2590191269" }],
    [{ scriptPublicKey: "R", amount: "720720000" }, { scriptPublicKey: "C", amount: "1869450407" }],
  );
  it("credits the recipient with what it received", () => {
    expect(netForAddress(t, "R")).toBe(720720000n); // +10 LNGX
  });
  it("debits the input owner for the full input it spent (change went elsewhere)", () => {
    expect(netForAddress(t, "S")).toBe(-2590191269n);
  });
  it("credits the fresh change address", () => {
    expect(netForAddress(t, "C")).toBe(1869450407n);
  });
  it("is zero for an uninvolved address", () => {
    expect(netForAddress(t, "X")).toBe(0n);
  });
  it("nets received minus spent when an address both spends and gets change back", () => {
    const self = tx([{ fromAddress: "A", amount: "100" }], [{ scriptPublicKey: "A", amount: "30" }]);
    expect(netForAddress(self, "A")).toBe(-70n);
  });
  it("does not count a spent item as tokens", () => {
    const t2 = tx(
      [{ fromAddress: "A", amount: "1", valueType: "item" }, { fromAddress: "A", amount: "100" }],
      [{ scriptPublicKey: "B", amount: "1", valueType: "item" }, { scriptPublicKey: "A", amount: "40" }],
    );
    expect(netForAddress(t2, "A")).toBe(-60n);
    expect(netForAddress(t2, "B")).toBe(0n);
  });
});

describe("swapLinesForAddress", () => {
  const itemLeg: SwapLeg = {
    from: ["A"], to: "B", txHash: "hA", met: true,
    asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null },
  };
  const tokenLeg: SwapLeg = {
    from: ["B"], to: "A", txHash: "hB", met: true,
    asset: { kind: "token", amount: "1000", genesisHash: null, metadata: null },
  };
  it("lists what the address gave, then what it received", () => {
    expect(swapLinesForAddress({ legs: [tokenLeg, itemLeg] }, "A")).toEqual([
      { sign: "−", text: "1 item" },
      { sign: "+", text: `${formatLngx("1000")} LNGX` },
    ]);
    expect(swapLinesForAddress({ legs: [tokenLeg, itemLeg] }, "B")).toEqual([
      { sign: "−", text: `${formatLngx("1000")} LNGX` },
      { sign: "+", text: "1 item" },
    ]);
  });
  it("is empty for a swap with no legs or an uninvolved address", () => {
    expect(swapLinesForAddress({ legs: [] }, "A")).toEqual([]);
    expect(swapLinesForAddress({ legs: [tokenLeg, itemLeg] }, "Z")).toEqual([]);
  });
});
