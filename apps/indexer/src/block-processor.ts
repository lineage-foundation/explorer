import { and, eq } from "drizzle-orm";
import type { Database } from "@explorer/db";
import { schema, getLatestCoinsHistoryOutIds } from "@explorer/db";
import type { LineageBlock, LineageTransaction } from "@explorer/chain";
import { mapBlockRow, mapOutputRow } from "./mappers.js";
import { BalanceTracker } from "./balance-tracker.js";

export interface PreparedTx { hash: string; tx: LineageTransaction; coinbase: boolean }

interface ResolvedOut { id: number; scriptPublicKey: string | null; isToken: boolean }

export async function processBlock(
  db: Database,
  args: { blockHash: string; block: LineageBlock; transactions: PreparedTx[]; skip: Set<string> },
): Promise<void> {
  const { blockHash, block, transactions, skip } = args;
  const blockRow = mapBlockRow(blockHash, block);

  await db.transaction(async (tx) => {
    // idempotency: skip the whole block if already indexed
    const existing = await tx.select({ id: schema.block.id })
      .from(schema.block).where(eq(schema.block.num, blockRow.num)).limit(1);
    if (existing.length > 0) return;

    await tx.insert(schema.block).values(blockRow);

    const tracker = new BalanceTracker();
    const outIdsByRef = new Map<string, ResolvedOut>();

    // PASS A: transactions + outputs
    const txIdByHash = new Map<string, number>();
    for (const p of transactions) {
      if (skip.has(p.hash)) continue;
      const [row] = await tx.insert(schema.transaction).values({
        hash: p.hash, blockHash, version: p.tx.version,
        druidInfo: p.tx.druid_info, fees: p.tx.fees ?? null, coinbase: p.coinbase,
      }).returning({ id: schema.transaction.id });
      const txId = row!.id;
      txIdByHash.set(p.hash, txId);

      for (const [n, output] of p.tx.outputs.entries()) {
        const mapped = mapOutputRow(txId, p.hash, output, n);
        const [outRow] = await tx.insert(schema.txOut).values({
          txId: mapped.txId, txHash: mapped.txHash, valueType: mapped.valueType,
          amount: mapped.amount, locktime: mapped.locktime, genesisHash: mapped.genesisHash,
          scriptPublicKey: mapped.scriptPublicKey, itemMetadata: mapped.itemMetadata, n: mapped.n,
        }).returning({ id: schema.txOut.id });
        const outId = outRow!.id;
        outIdsByRef.set(`${p.hash}:${n}`, { id: outId, scriptPublicKey: mapped.scriptPublicKey, isToken: mapped.isToken });
        if (mapped.isToken && mapped.scriptPublicKey) tracker.addGain(mapped.scriptPublicKey, outId);
      }
    }

    // PASS B: inputs + expansions + spends (all same-block outputs now exist)
    for (const p of transactions) {
      if (skip.has(p.hash)) continue;
      const txId = txIdByHash.get(p.hash)!;
      for (const input of p.tx.inputs) {
        const prev = input.previous_out;
        await tx.insert(schema.txIn).values({
          txId, txHash: p.hash,
          previousOutTxHash: prev?.t_hash ?? null,
          previousOutTxN: prev?.n ?? null,
          scriptSignature: input.script_signature,
        });
        if (!prev || typeof prev.n !== "number") continue;
        const resolved = await resolveOut(tx, outIdsByRef, prev.t_hash, prev.n);
        if (!resolved) continue;
        await tx.insert(schema.txInExpanded).values({
          txId, txHash: p.hash,
          previousOutTxHash: prev.t_hash, previousOutTxN: prev.n,
          scriptSignature: input.script_signature,
          outScriptPublicKey: resolved.scriptPublicKey,
        });
        if (resolved.isToken && resolved.scriptPublicKey) tracker.addSpend(resolved.scriptPublicKey, resolved.id);
      }
    }

    // coins_history: one row per touched address (idempotent within this block via prior whole-block skip)
    for (const address of tracker.touched()) {
      const previous = await getLatestCoinsHistoryOutIds(tx, address);
      const outIds = tracker.mergeFinal(previous, address);
      await tx.insert(schema.coinsHistory).values({ address, date: blockRow.timestamp, outIds });
    }
  });
}

async function resolveOut(
  db: Database,
  cache: Map<string, ResolvedOut>,
  txHash: string,
  n: number,
): Promise<ResolvedOut | null> {
  const cached = cache.get(`${txHash}:${n}`);
  if (cached) return cached;
  const [row] = await db.select({ id: schema.txOut.id, scriptPublicKey: schema.txOut.scriptPublicKey, valueType: schema.txOut.valueType })
    .from(schema.txOut).where(and(eq(schema.txOut.txHash, txHash), eq(schema.txOut.n, n))).limit(1);
  if (!row) return null;
  return { id: row.id, scriptPublicKey: row.scriptPublicKey, isToken: row.valueType === "token" };
}
