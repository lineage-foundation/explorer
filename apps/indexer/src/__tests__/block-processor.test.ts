import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, type Database, schema, getAccountBalance } from "@explorer/db";
import { processBlock } from "../block-processor.js";
import { buildBlock, buildTokenTx, buildSpendTx } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const db = () => handle.db;

beforeAll(() => { handle = createDb(URL); });
afterAll(async () => { await handle.close(); });
beforeEach(async () => {
  for (const t of [schema.txInExpanded, schema.txIn, schema.txOut, schema.coinsHistory, schema.transaction, schema.block]) {
    await db().delete(t);
  }
});

describe("processBlock", () => {
  it("writes token output, item output, coinbase, and a same-block spend", async () => {
    // block 0: coinbase mints 100 to A; t1 sends token 40 to A and an item to A
    const block = buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: ["t1", "t2"] });
    const cb = buildTokenTx([{ address: "A", amount: 100 }]);
    const t1 = buildTokenTx([{ address: "A", amount: 40 }]);
    const t2 = { version: 1, druid_info: null, inputs: [],
      outputs: [{ value: { Item: { amount: 1, genesis_hash: "g", metadata: "m" } }, locktime: 0, script_public_key: "A" }] };
    await processBlock(db(), {
      blockHash: "H0", block,
      transactions: [
        { hash: "cb0", tx: cb, coinbase: true },
        { hash: "t1", tx: t1, coinbase: false },
        { hash: "t2", tx: t2, coinbase: false },
      ],
      skip: new Set(),
    });

    const outs = await db().select().from(schema.txOut);
    expect(outs.filter((o) => o.valueType === "token")).toHaveLength(2);
    expect(outs.filter((o) => o.valueType === "item")).toHaveLength(1);
    // balance = 100 + 40 (item contributes 0)
    expect((await getAccountBalance(db(), "A")).balance).toBe("140");

    // block 1: t3 spends A's 40-token output (t1, n0), sending 40 to B
    const t1n0 = outs.find((o) => o.txHash === "t1" && o.n === 0)!;
    const block1 = buildBlock({ num: 1, hash: "H1", previousHash: "H0", miningTxHash: "cb1", txHashes: ["t3"] });
    const cb1 = buildTokenTx([{ address: "A", amount: 100 }]);
    const t3 = buildSpendTx({ prevHash: "t1", n: 0 }, [{ address: "B", amount: 40 }]);
    await processBlock(db(), {
      blockHash: "H1", block: block1,
      transactions: [{ hash: "cb1", tx: cb1, coinbase: true }, { hash: "t3", tx: t3, coinbase: false }],
      skip: new Set(),
    });

    const expanded = await db().select().from(schema.txInExpanded);
    expect(expanded[0]?.outScriptPublicKey).toBe("A"); // resolved spent output's address
    expect((await getAccountBalance(db(), "B")).balance).toBe("40");
    expect((await getAccountBalance(db(), "A")).balance).toBe("200"); // 140 - 40 + 100 (cb1)
  });

  it("is idempotent: reprocessing the same block adds no duplicate rows", async () => {
    const block = buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: ["t1"] });
    const args = { blockHash: "H0", block,
      transactions: [
        { hash: "cb0", tx: buildTokenTx([{ address: "A", amount: 5 }]), coinbase: true },
        { hash: "t1", tx: buildTokenTx([{ address: "A", amount: 5 }]), coinbase: false },
      ], skip: new Set<string>() };
    await processBlock(db(), args);
    await processBlock(db(), args);
    expect(await db().select().from(schema.block)).toHaveLength(1);
    expect(await db().select().from(schema.transaction)).toHaveLength(2);
  });

  it("skips a configured tx hash", async () => {
    const block = buildBlock({ num: 0, hash: "H0", previousHash: "", miningTxHash: "cb0", txHashes: ["bad"] });
    await processBlock(db(), {
      blockHash: "H0", block,
      transactions: [
        { hash: "cb0", tx: buildTokenTx([{ address: "A", amount: 1 }]), coinbase: true },
        { hash: "bad", tx: buildTokenTx([{ address: "A", amount: 9 }]), coinbase: false },
      ],
      skip: new Set(["bad"]),
    });
    const txs = await db().select().from(schema.transaction);
    expect(txs.map((t) => t.hash)).toEqual(["cb0"]);
  });
});
