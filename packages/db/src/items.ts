import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { block, transaction, txIn, txOut } from "./schema.js";
import { escapeLike, type Pagination } from "./queries.js";

/**
 * Items.
 *
 * An item is created by a create transaction and identified by that
 * transaction's hash (its genesis hash). The creation output carries the
 * metadata and has no genesis hash of its own on chain; transfers carry the
 * genesis hash but no metadata. `tx_out.itemGenesis` holds the item's identity
 * on both kinds of output, so everything here keys on it.
 */

export interface ItemSummary {
  genesisHash: string;
  metadata: string | null;
  // Units created, as a decimal string.
  totalAmount: string;
  creator: string | null;
  blockNum: number;
  blockHash: string;
  timestamp: Date | null;
  // Addresses currently holding at least one unit.
  holderCount: number;
}

function clampPage(opts: { limit?: number; offset?: number }) {
  return {
    limit: Math.min(Math.max(Math.trunc(opts.limit ?? 25), 1), 100),
    offset: Math.max(Math.trunc(opts.offset ?? 0), 0),
  };
}

// An output is unspent when no input references it.
const unspent = sql`not exists (
  select 1 from ${txIn} ti
  where ti."previousOutTxHash" = ${txOut.txHash} and ti."previousOutTxN" = ${txOut.n}
)`;

// A creation output: an item output with no genesis hash of its own.
const isCreation = and(eq(txOut.valueType, "item"), isNull(txOut.genesisHash));

function sumAmounts(amounts: (string | null)[]): string {
  return amounts
    .reduce((sum, a) => sum + (a !== null && /^[0-9]+$/.test(a) ? BigInt(a) : 0n), 0n)
    .toString();
}

async function holderCounts(db: Database, genesisHashes: string[]): Promise<Map<string, number>> {
  if (genesisHashes.length === 0) return new Map();
  const rows = await db
    .select({ genesis: txOut.itemGenesis, holders: sql<number>`count(distinct ${txOut.scriptPublicKey})::int` })
    .from(txOut)
    .where(and(inArray(txOut.itemGenesis, genesisHashes), unspent))
    .groupBy(txOut.itemGenesis);
  return new Map(rows.flatMap((r) => (r.genesis === null ? [] : [[r.genesis, r.holders] as const])));
}

/** Summaries for the given create transactions, in the caller's order. */
async function loadItemSummaries(db: Database, genesisHashes: string[]): Promise<ItemSummary[]> {
  if (genesisHashes.length === 0) return [];
  const [outs, counts] = await Promise.all([
    db
      .select({
        txHash: txOut.txHash, metadata: txOut.itemMetadata, creator: txOut.scriptPublicKey, amount: txOut.amount,
        blockNum: block.num, blockHash: block.hash, timestamp: block.timestamp,
      })
      .from(txOut)
      .innerJoin(transaction, eq(transaction.hash, txOut.txHash))
      .innerJoin(block, eq(block.hash, transaction.blockHash))
      .where(and(inArray(txOut.txHash, genesisHashes), isCreation))
      .orderBy(asc(txOut.txHash), asc(txOut.n)),
    holderCounts(db, genesisHashes),
  ]);
  const outsByHash = new Map<string, typeof outs>();
  for (const o of outs) {
    const bucket = outsByHash.get(o.txHash) ?? [];
    bucket.push(o);
    outsByHash.set(o.txHash, bucket);
  }
  return genesisHashes.flatMap((genesisHash) => {
    const creation = outsByHash.get(genesisHash);
    // Metadata and creator come from the first creation output.
    const first = creation?.[0];
    if (!creation || !first) return [];
    return [{
      genesisHash,
      metadata: first.metadata,
      totalAmount: sumAmounts(creation.map((o) => o.amount)),
      creator: first.creator,
      blockNum: first.blockNum,
      blockHash: first.blockHash,
      timestamp: first.timestamp,
      holderCount: counts.get(genesisHash) ?? 0,
    }];
  });
}

/** One item by its genesis hash, or null when that hash is not a create transaction. */
export async function getItem(db: Database, genesis: string): Promise<ItemSummary | null> {
  const [item] = await loadItemSummaries(db, [genesis]);
  return item ?? null;
}

/**
 * All items, newest first, optionally filtered by a case-insensitive metadata
 * substring. The creation output's id breaks ties within a block.
 */
export async function getItems(
  db: Database,
  opts: { q?: string; limit?: number; offset?: number },
): Promise<{ items: ItemSummary[]; pagination: Pagination }> {
  const { limit, offset } = clampPage(opts);
  const matches = opts.q
    ? sql`and o."itemMetadata" ilike ${`%${escapeLike(opts.q)}%`}`
    : sql``;
  const creation = sql`o."valueType" = 'item' and o."genesisHash" is null ${matches}`;
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(distinct o."txHash")::int as total from ${txOut} o where ${creation}
  `);
  const total = totalRows[0]?.total ?? 0;
  if (total === 0) return { items: [], pagination: { total, limit, offset, hasMore: false } };
  const page = await db.execute<{ hash: string }>(sql`
    select o."txHash" as hash
    from ${txOut} o
    inner join ${transaction} t on t.hash = o."txHash"
    inner join ${block} b on b.hash = t."blockHash"
    where ${creation}
    group by o."txHash", b.num
    order by b.num desc, max(o.id) desc
    limit ${limit} offset ${offset}
  `);
  return {
    items: await loadItemSummaries(db, page.map((r) => r.hash)),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
