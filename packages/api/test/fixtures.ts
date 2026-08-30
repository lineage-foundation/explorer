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
    { version: 1, num: 1, hash: "b_hash_1", timestamp: new Date("2024-01-01T00:00:00Z"), nbTx: 1 },
    { version: 1, num: 2, hash: "b_hash_2", previousHash: "b_hash_1", timestamp: new Date("2024-01-02T00:00:00Z"), nbTx: 1 },
  ]);
  await db.insert(transaction).values([
    { hash: "tx_1", blockHash: "b_hash_1", version: 1, coinbase: false },
    { hash: "tx_cb", blockHash: "b_hash_2", version: 1, coinbase: true },
    { hash: "tx_2", blockHash: "b_hash_2", version: 1, coinbase: false },
  ]);
  await db.insert(txOut).values([
    { txId: 1, txHash: "tx_1", valueType: "token", amount: "500", locktime: "0", scriptPublicKey: "addr_1", n: 0 },
  ]);
  await db.insert(txIn).values([
    { txId: 1, txHash: "tx_1", scriptSignature: {} },
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0 },
  ]);
  await db.insert(txInExpanded).values([
    { txId: 3, txHash: "tx_2", scriptSignature: {}, previousOutTxHash: "tx_1", previousOutTxN: 0, outScriptPublicKey: "addr_1" },
  ]);
  await db.insert(circulatingSupply).values([{ id: 1, circulatingSupply: "12345" }]);
  await db.insert(coinsHistory).values([
    { address: "addr_1", date: new Date("2024-01-03T00:00:00Z"), outIds: [1] },
  ]);
}
