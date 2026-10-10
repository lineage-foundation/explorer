import type { Database } from "@explorer/db";
import { schema } from "@explorer/db";

export async function seedFixtures(db: Database): Promise<void> {
  const { block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply } = schema;
  await db.delete(txInExpanded);
  await db.delete(txIn);
  await db.delete(txOut);
  await db.delete(transaction);
  await db.delete(coinsHistory);
  await db.delete(circulatingSupply);
  await db.delete(block);

  await db.insert(block).values([
    { version: 1, num: 1, hash: "b_hash_1", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1, bits: 486604799n },
    { version: 1, num: 2, hash: "b_hash_2", previousHash: "b_hash_1", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1 },
  ]);
  await db.insert(transaction).values([
    { hash: "tx_1", blockHash: "b_hash_1", version: 1, coinbase: false },
    { hash: "tx_cb", blockHash: "b_hash_2", version: 1, coinbase: true },
    { hash: "tx_2", blockHash: "b_hash_2", version: 1, coinbase: false },
  ]);
  const [out1] = await db
    .insert(txOut)
    .values([
      { txId: 1, txHash: "tx_1", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr_1", n: 0 },
    ])
    .returning({ id: txOut.id });
  await db.insert(txIn).values([
    { txId: 1, txHash: "tx_1", scriptSignature: {} },
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0 },
  ]);
  await db.insert(txInExpanded).values([
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0, outScriptPublicKey: "addr_1" },
  ]);
  await db.insert(circulatingSupply).values([{ id: 1, circulatingSupply: "12345", totalSupply: "50000" }]);
  await db.insert(coinsHistory).values([
    { address: "addr_1", date: new Date("2024-01-03T00:00:00Z"), outIds: [out1?.id] },
  ]);
}

type SwapSeedOut = { to: string; amount: string; kind?: "token" | "item"; genesis?: string };
interface SwapSeedTx {
  hash: string; druid?: string;
  expects?: { to: string; asset: unknown }[];
  ins?: { prev: string; n: number; from: string }[];
  outs: SwapSeedOut[];
}

/**
 * Two swaps in a third block, on top of seedFixtures. Kept out of the shared
 * seed so the counts other route tests assert do not shift.
 *   DRUID0xs1     — swap_a's item (gen_s ×1) for swap_b's 1000 tokens (with change)
 *   "odd druid/1" — a non-canonical DRUID: 40 tokens for 30 tokens
 */
export async function seedSwapFixtures(db: Database): Promise<void> {
  const { block, transaction, txIn, txOut, txInExpanded } = schema;
  await db.insert(block).values([
    { version: 1, num: 3, hash: "b_hash_3", previousHash: "b_hash_2", timestamp: new Date("2024-01-03T00:00:00Z"), nbTx: 5 },
  ]);
  const item = (amount: string, genesis: string) => ({ Item: { amount, genesis_hash: genesis, metadata: null } });
  const txs: SwapSeedTx[] = [
    {
      hash: "swap_fund",
      outs: [
        { to: "swap_b", amount: "1000000" }, { to: "swap_a", amount: "1", kind: "item", genesis: "gen_s" },
        { to: "odd_a", amount: "40" }, { to: "odd_b", amount: "30" },
      ],
    },
    {
      hash: "swap_half_a", druid: "DRUID0xs1", expects: [{ to: "swap_a", asset: { Token: "1000" } }],
      ins: [{ prev: "swap_fund", n: 1, from: "swap_a" }], outs: [{ to: "swap_b", amount: "1", kind: "item", genesis: "gen_s" }],
    },
    {
      hash: "swap_half_b", druid: "DRUID0xs1", expects: [{ to: "swap_b", asset: item("1", "gen_s") }],
      ins: [{ prev: "swap_fund", n: 0, from: "swap_b" }], outs: [{ to: "swap_a", amount: "1000" }, { to: "swap_b", amount: "999000" }],
    },
    {
      hash: "odd_half_a", druid: "odd druid/1", expects: [{ to: "odd_a", asset: { Token: "30" } }],
      ins: [{ prev: "swap_fund", n: 2, from: "odd_a" }], outs: [{ to: "odd_b", amount: "40" }],
    },
    {
      hash: "odd_half_b", druid: "odd druid/1", expects: [{ to: "odd_b", asset: { Token: "40" } }],
      ins: [{ prev: "swap_fund", n: 3, from: "odd_b" }], outs: [{ to: "odd_a", amount: "30" }],
    },
  ];
  for (const t of txs) {
    const [row] = await db.insert(transaction).values({
      hash: t.hash, blockHash: "b_hash_3", version: t.druid ? 2 : 1, coinbase: false,
      druid: t.druid ?? null,
      druidInfo: t.druid
        ? {
          druid: t.druid, participants: 2, genesis_hash: null,
          expectations: (t.expects ?? []).map((e) => ({ from: "hash-of-inputs", ...e })),
        }
        : null,
    }).returning({ id: transaction.id });
    const txId = row!.id;
    await db.insert(txOut).values(t.outs.map((o, n) => ({
      txId, txHash: t.hash, valueType: o.kind ?? "token", amount: o.amount, locktime: "0",
      genesisHash: o.genesis ?? null, scriptPublicKey: o.to, n,
    })));
    for (const i of t.ins ?? []) {
      const common = { txId, txHash: t.hash, scriptSignature: {}, previousOutTxHash: i.prev, previousOutTxN: i.n };
      await db.insert(txIn).values(common);
      await db.insert(txInExpanded).values({ ...common, outScriptPublicKey: i.from });
    }
  }
}
