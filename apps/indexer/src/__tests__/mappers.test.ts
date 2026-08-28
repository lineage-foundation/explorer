import { describe, it, expect } from "vitest";
import { mapBlockRow, mapOutputRow } from "../mappers.js";
import { buildBlock } from "./fake-source.js";

describe("mapBlockRow", () => {
  it("maps header fields with the exact conventions", () => {
    const block = buildBlock({ num: 7, hash: "H", previousHash: "P", miningTxHash: "cb", txHashes: ["a", "b"] });
    const row = mapBlockRow("H", block);
    expect(row.num).toBe(7);
    expect(row.hash).toBe("H");
    expect(row.previousHash).toBe("P");
    expect(row.bits).toBe(1n);
    expect(row.merkleRootHash).toBe("merkle"); // element [1]
    expect(row.nbTx).toBe(2);
    expect(row.timestamp.getTime()).toBe((1_700_000_000 + 7) * 1000);
  });
});

describe("mapOutputRow", () => {
  it("maps a token output", () => {
    const r = mapOutputRow(3, "tx", { value: { Token: 500 }, locktime: 0, script_public_key: "addr" }, 0);
    expect(r).toMatchObject({ txId: 3, txHash: "tx", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr", n: 0, isToken: true });
    expect(r.genesisHash).toBeNull();
  });
  it("maps an item output", () => {
    const r = mapOutputRow(3, "tx", { value: { Item: { amount: 2, genesis_hash: "g", metadata: "m" } }, locktime: 0, script_public_key: "addr" }, 1);
    expect(r).toMatchObject({ valueType: "item", amount: "2", genesisHash: "g", itemMetadata: "m", n: 1, isToken: false });
  });
});
