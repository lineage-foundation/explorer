import { createDb, schema } from "@explorer/db";
import { resetTestSchema } from "@explorer/db/test-support";

const URL = process.env.DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export async function seed(): Promise<void> {
  await resetTestSchema(URL);
  const { db, close } = createDb(URL);
  try {
    await db.insert(schema.block).values([
      { version: 1, num: 0, hash: "H0", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1 },
      { version: 1, num: 1, hash: "H1", previousHash: "H0", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1 },
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
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void seed();
}
