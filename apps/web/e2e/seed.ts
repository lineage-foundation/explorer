import { createDb, schema, type Database } from "@explorer/db";
import { resetTestSchema } from "@explorer/db/test-support";

const URL = process.env.DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export async function seed(): Promise<void> {
  await resetTestSchema(URL);
  const { db, close } = createDb(URL);
  try {
    await db.insert(schema.block).values([
      {
        version: 1, num: 0, hash: "H0", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1, nonceAndMiningTxHash: ["nonce0", "cb0"],
      },
      {
        version: 1, num: 1, hash: "H1", previousHash: "H0", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1, nonceAndMiningTxHash: ["nonce1", "cb1"],
      },
    ]);
    await db.insert(schema.transaction).values([
      { hash: "cb0", blockHash: "H0", version: 1, coinbase: true },
      { hash: "t0", blockHash: "H0", version: 1, coinbase: false },
      { hash: "cb1", blockHash: "H1", version: 1, coinbase: true },
      { hash: "t1", blockHash: "H1", version: 1, coinbase: false },
    ]);
    // amounts are raw units (÷72072000 for display); 30 LNGX = 30*72072000
    const R = (n: number) => (BigInt(n) * 72072000n).toString();
    await db.insert(schema.txOut).values([
      { txId: 1, txHash: "cb0", valueType: "token", amount: R(100), locktime: "0", scriptPublicKey: "addrA", n: 0 },
      { txId: 2, txHash: "t0", valueType: "token", amount: R(30), locktime: "0", scriptPublicKey: "addrA", n: 0 },
      { txId: 4, txHash: "t1", valueType: "token", amount: R(30), locktime: "0", scriptPublicKey: "addrB", n: 0 },
      // n:1 item output on t0; inserted last to keep the pre-existing txOut serial ids
      // (and coinsHistory.outIds below, which reference them) unchanged.
      {
        txId: 2, txHash: "t0", valueType: "item", amount: null, locktime: "0", genesisHash: "gen1", itemGenesis: "gen1", itemMetadata: "meta1", scriptPublicKey: "addrA", n: 1,
      },
    ]);
    await db.insert(schema.txIn).values([
      { txId: 4, txHash: "t1", previousOutTxHash: "t0", previousOutTxN: 0, scriptSignature: {} },
    ]);
    await db.insert(schema.txInExpanded).values([
      { txId: 4, txHash: "t1", previousOutTxHash: "t0", previousOutTxN: 0, scriptSignature: {}, outScriptPublicKey: "addrA" },
    ]);
    await db.insert(schema.coinsHistory).values([
      { address: "addrB", date: new Date("2024-01-02T00:00:00Z"), outIds: [3] },
    ]);
    await seedSwap(db);
  } finally {
    await close();
  }
}

export const SWAP_DRUID = `DRUID0x${"ab".repeat(16)}`;
// DRUIDs are chosen by clients, so one need not look like the SDK's. This one
// needs URL-encoding in every position a path segment can go wrong.
export const ODD_DRUID = "odd druid/1 50%";

// The item traded in the swap below: the hash of its create transaction.
export const ITEM_GENESIS = "gen2";

// A two-way swap in block 1 between two addresses of its own (addrC, addrD), so
// the balances and counts the other specs assert are untouched:
//   gen2 creates one item (with metadata) to addrD; f1 funds addrC with 10 LNGX;
//   sA — addrD gives the item to addrC, expecting 4 LNGX;
//   sB — addrC pays addrD 4 LNGX (6 LNGX change), expecting the item.
async function seedSwap(db: Database): Promise<void> {
  const R = (n: number) => (BigInt(n) * 72072000n).toString();
  const item = { amount: "1", genesis_hash: "gen2", metadata: null };
  const txs = [
    {
      // The create transaction: its item output has no genesis hash of its own.
      hash: ITEM_GENESIS, druidInfo: null,
      ins: [] as { prev: string; n: number; from: string }[],
      outs: [{ to: "addrD", valueType: "item", amount: "1", genesisHash: null, meta: '{"title":"Seed Relic","medium":"digital"}' }],
    },
    {
      hash: "f1", druidInfo: null,
      ins: [] as { prev: string; n: number; from: string }[],
      outs: [{ to: "addrC", valueType: "token", amount: R(10), genesisHash: null }],
    },
    {
      hash: "sA",
      druidInfo: { druid: SWAP_DRUID, participants: 2, genesis_hash: null, expectations: [{ from: "ins-hash", to: "addrD", asset: { Token: R(4) } }] },
      ins: [{ prev: ITEM_GENESIS, n: 0, from: "addrD" }],
      outs: [{ to: "addrC", valueType: "item", amount: "1", genesisHash: "gen2" }],
    },
    {
      hash: "sB",
      druidInfo: { druid: SWAP_DRUID, participants: 2, genesis_hash: null, expectations: [{ from: "ins-hash", to: "addrC", asset: { Item: item } }] },
      ins: [{ prev: "f1", n: 0, from: "addrC" }],
      outs: [
        { to: "addrD", valueType: "token", amount: R(4), genesisHash: null },
        { to: "addrC", valueType: "token", amount: R(6), genesisHash: null },
      ],
    },
  ];
  // A second swap under a non-canonical DRUID: addrE's 3 LNGX for addrF's 2 LNGX.
  const odd = (to: string, amount: string) => ({
    druid: ODD_DRUID, participants: 2, genesis_hash: null,
    expectations: [{ from: "ins-hash", to, asset: { Token: amount } }],
  });
  const oddTxs = [
    {
      hash: "f2", druidInfo: null, ins: [] as { prev: string; n: number; from: string }[],
      outs: [
        { to: "addrE", valueType: "token", amount: R(3), genesisHash: null },
        { to: "addrF", valueType: "token", amount: R(2), genesisHash: null },
      ],
    },
    {
      hash: "oA", druidInfo: odd("addrE", R(2)), ins: [{ prev: "f2", n: 0, from: "addrE" }],
      outs: [{ to: "addrF", valueType: "token", amount: R(3), genesisHash: null }],
    },
    {
      hash: "oB", druidInfo: odd("addrF", R(3)), ins: [{ prev: "f2", n: 1, from: "addrF" }],
      outs: [{ to: "addrE", valueType: "token", amount: R(2), genesisHash: null }],
    },
  ];
  const outIds = new Map<string, number>();
  for (const t of [...txs, ...oddTxs]) {
    const [row] = await db.insert(schema.transaction).values({
      hash: t.hash, blockHash: "H1", version: t.druidInfo ? 2 : 1, coinbase: false,
      druidInfo: t.druidInfo, druid: t.druidInfo ? t.druidInfo.druid : null,
    }).returning({ id: schema.transaction.id });
    const txId = row!.id;
    for (const [n, o] of t.outs.entries()) {
      const [out] = await db.insert(schema.txOut).values({
        txId, txHash: t.hash, valueType: o.valueType, amount: o.amount, locktime: "0",
        genesisHash: o.genesisHash, scriptPublicKey: o.to, n,
        itemGenesis: o.valueType === "item" ? (o.genesisHash ?? t.hash) : null,
        itemMetadata: (o as { meta?: string }).meta ?? null,
      }).returning({ id: schema.txOut.id });
      outIds.set(`${t.hash}:${n}`, out!.id);
    }
    for (const i of t.ins) {
      const common = { txId, txHash: t.hash, previousOutTxHash: i.prev, previousOutTxN: i.n, scriptSignature: {} };
      await db.insert(schema.txIn).values(common);
      await db.insert(schema.txInExpanded).values({ ...common, outScriptPublicKey: i.from });
    }
  }
  const date = new Date("2024-01-02T00:00:00Z");
  await db.insert(schema.coinsHistory).values([
    { address: "addrC", date, blockNum: 1, outIds: [outIds.get("sB:1")] },
    { address: "addrD", date, blockNum: 1, outIds: [outIds.get("sB:0")] },
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void seed();
}
