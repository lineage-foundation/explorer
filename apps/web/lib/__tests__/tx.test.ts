import { describe, it, expect } from "vitest";
import type { TxDetail } from "@explorer/db";
import { netForAddress } from "../tx.js";

function tx(
  ins: { fromAddress: string | null; amount: string | null }[],
  outs: { scriptPublicKey: string | null; amount: string | null; valueType?: string }[],
): TxDetail {
  return {
    blockHash: "b", hash: "h", version: 1, timestamp: null, coinbase: false, fees: null, druidInfo: null,
    ins: ins.map((i) => ({ scriptSignature: {}, previousOutTxHash: null, previousOutTxN: null, fromAddress: i.fromAddress, amount: i.amount })),
    outs: outs.map((o, n) => ({ valueType: o.valueType ?? "token", amount: o.amount, locktime: "0", genesisHash: null, scriptPublicKey: o.scriptPublicKey, itemMetadata: null, n })),
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
});
