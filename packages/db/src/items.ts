import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./client.js";
import { block, transaction, txIn, txInExpanded, txOut } from "./schema.js";
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

// The same unspent test for raw queries that alias tx_out as `o`.
const unspentO = sql`not exists (
  select 1 from ${txIn} ti
  where ti."previousOutTxHash" = o."txHash" and ti."previousOutTxN" = o.n
)`;

export interface ItemHolder {
  address: string;
  amount: string;
}

/**
 * Addresses holding the item now, largest holding first. `tx_out.amount` is
 * nullable, so an output with no amount recorded counts as zero rather than
 * making the sum null.
 */
export async function getItemHolders(
  db: Database,
  genesis: string,
  opts: { limit?: number; offset?: number },
): Promise<{ holders: ItemHolder[]; pagination: Pagination }> {
  const { limit, offset } = clampPage(opts);
  const held = sql`o."itemGenesis" = ${genesis} and o."scriptPublicKey" is not null and ${unspentO}`;
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(distinct o."scriptPublicKey")::int as total from ${txOut} o where ${held}
  `);
  const total = totalRows[0]?.total ?? 0;
  if (total === 0) return { holders: [], pagination: { total, limit, offset, hasMore: false } };
  const holders = await db.execute<{ address: string; amount: string }>(sql`
    select o."scriptPublicKey" as address, coalesce(sum(o.amount), 0)::text as amount
    from ${txOut} o
    where ${held}
    group by o."scriptPublicKey"
    order by coalesce(sum(o.amount), 0) desc, o."scriptPublicKey" asc
    limit ${limit} offset ${offset}
  `);
  return {
    holders: holders.map((h) => ({ address: h.address, amount: h.amount })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}

export interface ItemTransfer {
  txHash: string;
  blockNum: number;
  blockHash: string;
  timestamp: Date | null;
  // Input addresses that spent this item in the transaction. Empty for the
  // create transaction, and when the inputs did not resolve.
  from: string[];
  // This item's outputs in the transaction.
  to: { address: string | null; amount: string }[];
  // Set when the transaction is one half of a two-way swap.
  druid: string | null;
  // True for the create transaction itself.
  created: boolean;
}

/** Every transaction with an output of the item, newest first. */
export async function getItemTransfers(
  db: Database,
  genesis: string,
  opts: { limit?: number; offset?: number },
): Promise<{ transfers: ItemTransfer[]; pagination: Pagination }> {
  const { limit, offset } = clampPage(opts);
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(distinct o."txHash")::int as total from ${txOut} o where o."itemGenesis" = ${genesis}
  `);
  const total = totalRows[0]?.total ?? 0;
  if (total === 0) return { transfers: [], pagination: { total, limit, offset, hasMore: false } };
  // transaction.id breaks ties between transfers in the same block.
  const page = await db.execute<{ hash: string }>(sql`
    select t.hash
    from ${transaction} t
    inner join ${block} b on b.hash = t."blockHash"
    where exists (select 1 from ${txOut} o where o."txHash" = t.hash and o."itemGenesis" = ${genesis})
    order by b.num desc, t.id desc
    limit ${limit} offset ${offset}
  `);
  const hashes = page.map((r) => r.hash);
  const spent = alias(txOut, "spent");
  const [txs, outs, senders] = await Promise.all([
    db
      .select({
        hash: transaction.hash, druid: transaction.druid,
        blockNum: block.num, blockHash: block.hash, timestamp: block.timestamp,
      })
      .from(transaction)
      .innerJoin(block, eq(block.hash, transaction.blockHash))
      .where(inArray(transaction.hash, hashes)),
    db
      .select({ txHash: txOut.txHash, address: txOut.scriptPublicKey, amount: txOut.amount })
      .from(txOut)
      .where(and(inArray(txOut.txHash, hashes), eq(txOut.itemGenesis, genesis)))
      .orderBy(asc(txOut.txHash), asc(txOut.n)),
    // Inputs of these transactions that spent an output of this item.
    db
      .selectDistinct({ txHash: txInExpanded.txHash, address: txInExpanded.outScriptPublicKey })
      .from(txInExpanded)
      .innerJoin(spent, and(
        eq(spent.txHash, txInExpanded.previousOutTxHash),
        eq(spent.n, txInExpanded.previousOutTxN),
      ))
      .where(and(inArray(txInExpanded.txHash, hashes), eq(spent.itemGenesis, genesis)))
      .orderBy(asc(txInExpanded.txHash), asc(txInExpanded.outScriptPublicKey)),
  ]);
  const txByHash = new Map(txs.map((t) => [t.hash, t]));
  const transfers = hashes.flatMap((hash): ItemTransfer[] => {
    const tx = txByHash.get(hash);
    if (!tx) return [];
    return [{
      txHash: hash,
      blockNum: tx.blockNum,
      blockHash: tx.blockHash,
      timestamp: tx.timestamp,
      from: senders.flatMap((s) => (s.txHash === hash && s.address !== null ? [s.address] : [])),
      to: outs.filter((o) => o.txHash === hash).map((o) => ({ address: o.address, amount: o.amount ?? "0" })),
      druid: tx.druid,
      created: hash === genesis,
    }];
  });
  return { transfers, pagination: { total, limit, offset, hasMore: offset + limit < total } };
}

export interface AddressItem {
  genesisHash: string;
  amount: string;
  // The item's metadata; null when it has none or its create transaction is not indexed.
  metadata: string | null;
}

/** The items an address holds now, ordered by genesis hash. */
export async function getAddressItems(
  db: Database,
  address: string,
  opts: { limit?: number; offset?: number },
): Promise<{ items: AddressItem[]; pagination: Pagination }> {
  const { limit, offset } = clampPage(opts);
  const held = sql`o."scriptPublicKey" = ${address} and o."itemGenesis" is not null and ${unspentO}`;
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(distinct o."itemGenesis")::int as total from ${txOut} o where ${held}
  `);
  const total = totalRows[0]?.total ?? 0;
  if (total === 0) return { items: [], pagination: { total, limit, offset, hasMore: false } };
  const page = await db.execute<{ genesis: string; amount: string }>(sql`
    select o."itemGenesis" as genesis, coalesce(sum(o.amount), 0)::text as amount
    from ${txOut} o
    where ${held}
    group by o."itemGenesis"
    order by o."itemGenesis" asc
    limit ${limit} offset ${offset}
  `);
  const metadata = await itemMetadata(db, page.map((r) => r.genesis));
  return {
    items: page.map((r) => ({ genesisHash: r.genesis, amount: r.amount, metadata: metadata.get(r.genesis) ?? null })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}

/** Each item's metadata, read from its first creation output. */
export async function itemMetadata(db: Database, genesisHashes: string[]): Promise<Map<string, string | null>> {
  const wanted = [...new Set(genesisHashes)];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ txHash: txOut.txHash, metadata: txOut.itemMetadata })
    .from(txOut)
    .where(and(inArray(txOut.txHash, wanted), isCreation))
    .orderBy(asc(txOut.txHash), asc(txOut.n));
  const result = new Map<string, string | null>();
  for (const r of rows) if (!result.has(r.txHash)) result.set(r.txHash, r.metadata);
  return result;
}
