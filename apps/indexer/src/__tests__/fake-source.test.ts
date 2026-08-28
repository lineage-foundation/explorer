import { describe, it, expect } from "vitest";
import { FakeSourceClient, buildBlock, buildTokenTx } from "./fake-source.js";

describe("FakeSourceClient", () => {
  it("serves block ranges and tx lookups by hash", async () => {
    const s = new FakeSourceClient();
    s.addBlock("h1", buildBlock({ num: 0, hash: "h1", previousHash: "", miningTxHash: "cb0", txHashes: ["t1"] }));
    s.addTx("t1", buildTokenTx([{ address: "addrA", amount: 5 }]));
    const range = await s.getBlockRange(0, 0);
    expect(range[0]?.[0]).toBe("h1");
    expect((await s.getTransactionsByHash(["t1"]))[0]?.[1].outputs[0]?.script_public_key).toBe("addrA");
  });
});
