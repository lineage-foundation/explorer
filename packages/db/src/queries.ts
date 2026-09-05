import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import BigNumber from "bignumber.js";
import type { Database } from "./client.js";
import {
  block, transaction, txIn, txOut, txInExpanded, coinsHistory, circulatingSupply,
} from "./schema.js";
import type { Block, TxIn, TxOut } from "./schema.js";

export type Order = "asc" | "desc";
export interface Pagination { total: number; limit: number; offset: number; hasMore?: boolean }

// Defense-in-depth: callers (API/web) validate pagination, but clamp here too so
// a stray negative limit can't make Postgres throw and an absurd limit can't run
// an unbounded scan.
function clampLimit(n: number): number {
  return Math.min(Math.max(Math.trunc(n), 1), 1000);
}
function clampOffset(n: number): number {
  return Math.max(Math.trunc(n), 0);
}
export interface BlockListItem {
  version: number; num: number; hash: string; previousHash: string | null;
  timestamp: Date | null; nbTx: number | null; reward: string | null; miner: string | null;
}
export interface BlockTxItem {
  hash: string; blockHash: string; version: number; timestamp: Date | null;
  txType: string | undefined; coinbase: boolean;
}
export interface TxListItem {
  hash: string; blockHash: string; blockNum: number; version: number;
  timestamp: Date | null; txType: string | undefined; value: string | null;
}
export interface TxDetail {
  blockHash: string; hash: string; version: number; timestamp: Date | null;
  coinbase: boolean;
  fees: unknown; druidInfo: unknown;
  ins: {
    scriptSignature: unknown;
    previousOutTxHash: string | null;
    previousOutTxN: number | null;
    fromAddress: string | null;
    amount: string | null;
  }[];
  outs: {
    valueType: string; amount: string | null; locktime: string;
    genesisHash: string | null; scriptPublicKey: string | null; itemMetadata: string | null; n: number;
  }[];
}

function isHash(value: string): boolean {
  // Treat as a block number only when the entire string is digits. `parseInt`
  // stops at the first non-digit, so "123abc" would otherwise be read as block
  // 123; require a full match so a malformed id is looked up as a hash (and
  // 404s) instead of silently resolving to the wrong block.
  return !/^\d+$/.test(value);
}

export async function getBlocksCount(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(block);
  return row?.value ?? 0;
}

export async function getBlocks(
  db: Database,
  opts: { limit?: number; offset?: number; order?: Order },
): Promise<{ blocks: BlockListItem[]; pagination: Pagination }> {
  const limit = clampLimit(opts.limit ?? 10);
  const offset = clampOffset(opts.offset ?? 0);
  const direction = (opts.order ?? "desc") === "asc" ? asc : desc;
  const total = await getBlocksCount(db);
  const rows = await db
    .select({
      version: block.version, num: block.num, hash: block.hash,
      previousHash: block.previousHash, timestamp: block.timestamp, nbTx: block.nbTx,
    })
    .from(block)
    .orderBy(direction(block.num))
    .limit(limit)
    .offset(offset);
  // Block reward = the sum of the block's coinbase outputs; miner = the address
  // on the coinbase's first output. These are independent — fetch in parallel.
  const blockHashes = rows.map((r) => r.hash);
  const [rewards, miners] = blockHashes.length
    ? await Promise.all([
        db
          .select({ blockHash: transaction.blockHash, reward: sql<string>`sum(${txOut.amount})` })
          .from(transaction)
          .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
          .where(and(inArray(transaction.blockHash, blockHashes), eq(transaction.coinbase, true)))
          .groupBy(transaction.blockHash),
        db
          .select({ blockHash: transaction.blockHash, address: txOut.scriptPublicKey })
          .from(transaction)
          .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
          .where(and(
            inArray(transaction.blockHash, blockHashes),
            eq(transaction.coinbase, true),
            eq(txOut.n, 0),
          )),
      ])
    : [[], []];
  const rewardByHash = new Map(rewards.map((r) => [r.blockHash, r.reward]));
  const minerByHash = new Map(miners.map((m) => [m.blockHash, m.address]));
  return {
    blocks: rows.map((r) => ({
      ...r, reward: rewardByHash.get(r.hash) ?? null, miner: minerByHash.get(r.hash) ?? null,
    })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}

export async function getBlockCoinbaseInfo(
  db: Database,
  blockHash: string,
): Promise<{ reward: string | null; miner: string | null }> {
  const [rewardRow] = await db
    .select({ reward: sql<string | null>`sum(${txOut.amount})` })
    .from(transaction)
    .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
    .where(and(eq(transaction.blockHash, blockHash), eq(transaction.coinbase, true)));
  const [minerRow] = await db
    .select({ address: txOut.scriptPublicKey })
    .from(transaction)
    .innerJoin(txOut, eq(txOut.txHash, transaction.hash))
    .where(and(
      eq(transaction.blockHash, blockHash),
      eq(transaction.coinbase, true),
      eq(txOut.n, 0),
    ))
    .limit(1);
  return { reward: rewardRow?.reward ?? null, miner: minerRow?.address ?? null };
}

export async function getBlockByHashOrNumber(db: Database, hashOrNumber: string): Promise<Block | null> {
  const where = isHash(hashOrNumber)
    ? eq(block.hash, hashOrNumber)
    : eq(block.num, parseInt(hashOrNumber, 10));
  const [row] = await db.select().from(block).where(where).limit(1);
  return row ?? null;
}

export async function getBlockTransactions(
  db: Database,
  hashOrNumber: string,
): Promise<{ transactions: BlockTxItem[] } | null> {
  const found = await getBlockByHashOrNumber(db, hashOrNumber);
  if (!found) return null;
  return getBlockTransactionsForBlock(db, found);
}

// Same as getBlockTransactions but for a block the caller has already resolved,
// avoiding a redundant block lookup.
export async function getBlockTransactionsForBlock(
  db: Database,
  found: { hash: string; timestamp: Date | null },
): Promise<{ transactions: BlockTxItem[] }> {
  // Include the coinbase (block-reward) transaction, ordered first, so a block's
  // full transaction set is visible.
  const txs = await db
    .select({
      hash: transaction.hash, blockHash: transaction.blockHash,
      version: transaction.version, coinbase: transaction.coinbase,
    })
    .from(transaction)
    .where(eq(transaction.blockHash, found.hash))
    // coinbase first, then a unique tiebreaker so multiple non-coinbase txs in a
    // block have a stable order across loads.
    .orderBy(desc(transaction.coinbase), asc(transaction.id));
  const hashes = txs.map((t) => t.hash);
  const firstOuts = hashes.length
    ? await db.select({ txHash: txOut.txHash, valueType: txOut.valueType })
        .from(txOut).where(and(inArray(txOut.txHash, hashes), eq(txOut.n, 0)))
    : [];
  const typeByHash = new Map(firstOuts.map((o) => [o.txHash, o.valueType]));
  return {
    transactions: txs.map((t) => ({
      hash: t.hash, blockHash: t.blockHash, version: t.version,
      timestamp: found.timestamp, txType: typeByHash.get(t.hash), coinbase: t.coinbase,
    })),
  };
}

export async function getTransactionsCount(db: Database): Promise<number> {
  // Excludes coinbase (mining) transactions so the surfaced "transactions"
  // count matches the transactions list, which also hides them. Otherwise a
  // per-block mining tx inflates the total (one per block).
  const [row] = await db
    .select({ value: count() }).from(transaction).where(eq(transaction.coinbase, false));
  return row?.value ?? 0;
}

export async function getTransactions(
  db: Database,
  opts: { limit?: number; offset?: number; order?: Order },
): Promise<{ transactions: TxListItem[]; pagination: Pagination }> {
  const limit = clampLimit(opts.limit ?? 10);
  const offset = clampOffset(opts.offset ?? 0);
  const direction = (opts.order ?? "desc") === "asc" ? asc : desc;
  const [totalRow] = await db
    .select({ value: count() }).from(transaction).where(eq(transaction.coinbase, false));
  const total = totalRow?.value ?? 0;
  if (total === 0) {
    return { transactions: [], pagination: { total, limit, offset, hasMore: false } };
  }
  const rows = await db
    .select({
      hash: transaction.hash, blockHash: transaction.blockHash, blockNum: block.num,
      version: transaction.version, timestamp: block.timestamp,
    })
    .from(transaction)
    .innerJoin(block, eq(block.hash, transaction.blockHash))
    .where(eq(transaction.coinbase, false))
    // transaction.id breaks ties between rows sharing a block number, so
    // offset pagination stays stable (block.num alone is not unique per tx).
    .orderBy(direction(block.num), direction(transaction.id))
    .limit(limit)
    .offset(offset);
  const hashes = rows.map((r) => r.hash);
  const firstOuts = hashes.length
    ? await db.select({ txHash: txOut.txHash, valueType: txOut.valueType })
        .from(txOut).where(and(inArray(txOut.txHash, hashes), eq(txOut.n, 0)))
    : [];
  const typeByHash = new Map(firstOuts.map((o) => [o.txHash, o.valueType]));
  // Transaction value = the sum of all of its outputs.
  const values = hashes.length
    ? await db
        .select({ txHash: txOut.txHash, value: sql<string>`sum(${txOut.amount})` })
        .from(txOut).where(inArray(txOut.txHash, hashes)).groupBy(txOut.txHash)
    : [];
  const valueByHash = new Map(values.map((v) => [v.txHash, v.value]));
  return {
    transactions: rows.map((r) => ({
      ...r, txType: typeByHash.get(r.hash), value: valueByHash.get(r.hash) ?? null,
    })),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}

async function loadTxDetails(db: Database, hashes: string[]): Promise<TxDetail[]> {
  if (hashes.length === 0) return [];
  // The four reads are independent — issue them in parallel.
  const [txs, ins, outs, expanded] = await Promise.all([
    db
      .select({
        hash: transaction.hash, blockHash: transaction.blockHash, version: transaction.version,
        coinbase: transaction.coinbase,
        fees: transaction.fees, druidInfo: transaction.druidInfo, timestamp: block.timestamp,
      })
      .from(transaction)
      .innerJoin(block, eq(block.hash, transaction.blockHash))
      .where(inArray(transaction.hash, hashes)),
    db.select().from(txIn).where(inArray(txIn.txHash, hashes)),
    db.select().from(txOut).where(inArray(txOut.txHash, hashes)),
    db
      .select({
        txHash: txInExpanded.txHash,
        previousOutTxHash: txInExpanded.previousOutTxHash,
        previousOutTxN: txInExpanded.previousOutTxN,
        fromAddress: txInExpanded.outScriptPublicKey,
        amount: txOut.amount,
      })
      .from(txInExpanded)
      .leftJoin(
        txOut,
        and(
          eq(txOut.txHash, txInExpanded.previousOutTxHash),
          eq(txOut.n, txInExpanded.previousOutTxN),
        ),
      )
      .where(inArray(txInExpanded.txHash, hashes)),
  ]);
  const insByHash = groupBy(ins, (i) => i.txHash);
  const outsByHash = groupBy(outs, (o) => o.txHash);
  const expandedByKey = new Map(
    expanded.map((e) => [`${e.txHash}:${e.previousOutTxHash}:${e.previousOutTxN}`, e]),
  );
  const detailByHash = new Map<string, TxDetail>(
    txs.map((t) => [t.hash, {
      blockHash: t.blockHash, hash: t.hash, version: t.version, coinbase: t.coinbase, timestamp: t.timestamp,
      fees: t.fees, druidInfo: t.druidInfo,
      ins: (insByHash.get(t.hash) ?? []).map((i: TxIn) => {
        const resolved = expandedByKey.get(`${t.hash}:${i.previousOutTxHash}:${i.previousOutTxN}`);
        return {
          scriptSignature: i.scriptSignature,
          previousOutTxHash: i.previousOutTxHash, previousOutTxN: i.previousOutTxN,
          fromAddress: resolved?.fromAddress ?? null,
          amount: resolved?.amount ?? null,
        };
      }),
      outs: (outsByHash.get(t.hash) ?? []).map((o: TxOut) => ({
        valueType: o.valueType, amount: o.amount, locktime: o.locktime,
        genesisHash: o.genesisHash, scriptPublicKey: o.scriptPublicKey,
        itemMetadata: o.itemMetadata, n: o.n,
      })),
    }]),
  );
  // Preserve the caller's hash order — callers pass an already-paginated,
  // deterministically-ordered hash list and expect the details back in that order.
  return hashes.flatMap((h) => {
    const detail = detailByHash.get(h);
    return detail ? [detail] : [];
  });
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export async function getTransactionByHash(db: Database, hash: string): Promise<TxDetail | null> {
  const [detail] = await loadTxDetails(db, [hash]);
  return detail ?? null;
}

export async function getAccountBalance(db: Database, address: string): Promise<{ balance: string }> {
  const [latest] = await db
    .select({ outIds: coinsHistory.outIds })
    .from(coinsHistory)
    .where(eq(coinsHistory.address, address))
    .orderBy(desc(coinsHistory.date), desc(coinsHistory.id))
    .limit(1);
  const outIds = (latest?.outIds as number[] | undefined) ?? [];
  if (outIds.length === 0) return { balance: "0" };
  const outs = await db.select({ amount: txOut.amount }).from(txOut).where(inArray(txOut.id, outIds));
  const balance = outs.reduce(
    (acc, out) => acc.plus(new BigNumber(out.amount ?? "0")),
    new BigNumber(0),
  );
  return { balance: balance.toFixed(0) };
}

export async function getAccountTransactions(
  db: Database,
  address: string,
  opts: { limit?: number; offset?: number },
): Promise<{ transactions: TxDetail[]; pagination: Pagination }> {
  const limit = clampLimit(opts.limit ?? 25);
  const offset = clampOffset(opts.offset ?? 0);
  // Match transactions that pay this address via any output. The tx_out join
  // alone is sufficient; a tx_in join would additionally require the tx to have
  // inputs, silently excluding coinbase (mining-reward) transactions, which have
  // none.
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from (
      select distinct t.hash, b.num
      from ${transaction} t
      inner join ${block} b on b.hash = t."blockHash"
      inner join ${txOut} tout on t.hash = tout."txHash"
      where tout."scriptPublicKey" = ${address}
    ) temp
  `);
  const total = totalRows[0]?.total ?? 0;
  if (!total) {
    return { transactions: [], pagination: { total: 0, limit, offset, hasMore: false } };
  }
  // t.id is a unique tiebreaker so paging over rows sharing a block number is
  // stable; it must appear in the select list to be usable by SELECT DISTINCT's
  // ORDER BY.
  const hashRows = await db.execute<{ hash: string }>(sql`
    select distinct t.id, t.hash, b.num
    from ${transaction} t
    inner join ${block} b on b.hash = t."blockHash"
    inner join ${txOut} tout on t.hash = tout."txHash"
    where tout."scriptPublicKey" = ${address}
    order by b.num desc, t.id desc
    limit ${limit} offset ${offset}
  `);
  const details = await loadTxDetails(db, hashRows.map((r) => r.hash));
  return { transactions: details, pagination: { total, limit, offset, hasMore: offset + limit < total } };
}

export async function getCirculatingSupply(
  db: Database,
): Promise<{ circulatingSupply: string; totalSupply: string | null }> {
  const [row] = await db.select().from(circulatingSupply).limit(1);
  return { circulatingSupply: row?.circulatingSupply ?? "0", totalSupply: row?.totalSupply ?? null };
}

export async function getMaxBlockNum(db: Database): Promise<number | null> {
  const [row] = await db.select({ max: sql<number | null>`max(${block.num})` }).from(block);
  return row?.max ?? null;
}

export interface PrefixMatches {
  blocks: { num: number; hash: string }[];
  transactions: { hash: string }[];
  addresses: { address: string }[];
}

// Escape LIKE metacharacters so a user-typed prefix matches literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Prefix search across block hashes, transaction hashes, and output addresses.
 * The prefix is lower-cased (stored identifiers are lower-case hex) and matched
 * with `LIKE 'prefix%'`. Note: on a non-C collation these scans are not
 * index-assisted — add `varchar_pattern_ops` indexes on block.hash,
 * transaction.hash and tx_out."scriptPublicKey" before a large production chain.
 */
export async function searchByPrefix(db: Database, prefix: string, limit: number): Promise<PrefixMatches> {
  limit = clampLimit(limit);
  const pattern = `${escapeLike(prefix.toLowerCase())}%`;
  const [blocks, transactions, addressRows] = await Promise.all([
    db.select({ num: block.num, hash: block.hash }).from(block)
      .where(like(block.hash, pattern)).orderBy(desc(block.num)).limit(limit),
    db.select({ hash: transaction.hash }).from(transaction)
      .where(like(transaction.hash, pattern)).limit(limit),
    db.selectDistinct({ address: txOut.scriptPublicKey }).from(txOut)
      .where(and(isNotNull(txOut.scriptPublicKey), like(txOut.scriptPublicKey, pattern))).limit(limit),
  ]);
  return {
    blocks,
    transactions,
    addresses: addressRows
      .map((r) => r.address)
      .filter((a): a is string => a !== null)
      .map((address) => ({ address })),
  };
}

export async function getBlockHashByNum(db: Database, num: number): Promise<string | null> {
  const [row] = await db.select({ hash: block.hash }).from(block).where(eq(block.num, num)).limit(1);
  return row?.hash ?? null;
}

export interface ItemOutput {
  genesisHash: string | null;
  metadata: string | null;
  address: string | null;
  amount: string | null;
  spent: boolean;
  txHash: string;
  n: number;
  blockNum: number;
  blockHash: string;
  timestamp: Date | null;
}

/**
 * Search item outputs (tx_out rows with valueType 'item') by a case-insensitive
 * metadata substring and/or an exact genesis hash (item class). `spent` reports
 * whether the output has since been spent (false ⇒ a current holder). Ordered
 * newest-first with a unique tiebreaker for stable pagination. Amounts stay
 * strings. `q` is escaped for LIKE metacharacters.
 */
export async function searchItems(
  db: Database,
  opts: { q?: string; genesis?: string; limit?: number; offset?: number },
): Promise<{ items: ItemOutput[]; pagination: Pagination }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const filters = [eq(txOut.valueType, "item")];
  if (opts.genesis) filters.push(eq(txOut.genesisHash, opts.genesis));
  if (opts.q) filters.push(ilike(txOut.itemMetadata, `%${escapeLike(opts.q)}%`));
  const where = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(txOut).where(where);
  const total = totalRow?.value ?? 0;
  if (total === 0) return { items: [], pagination: { total: 0, limit, offset, hasMore: false } };

  const spent = sql<boolean>`exists (
    select 1 from ${txIn} ti
    where ti."previousOutTxHash" = ${txOut.txHash} and ti."previousOutTxN" = ${txOut.n}
  )`;
  const rows = await db
    .select({
      genesisHash: txOut.genesisHash, metadata: txOut.itemMetadata, address: txOut.scriptPublicKey,
      amount: txOut.amount, txHash: txOut.txHash, n: txOut.n,
      blockNum: block.num, blockHash: block.hash, timestamp: block.timestamp, spent,
    })
    .from(txOut)
    .innerJoin(transaction, eq(transaction.hash, txOut.txHash))
    .innerJoin(block, eq(block.hash, transaction.blockHash))
    .where(where)
    .orderBy(desc(block.num), desc(txOut.id))
    .limit(limit)
    .offset(offset);

  return { items: rows, pagination: { total, limit, offset, hasMore: offset + limit < total } };
}

/**
 * Clear all indexed chain data (blocks, transactions and their in/out rows, and
 * the balance-tracking coins_history) so the indexer can rebuild from genesis
 * after the source chain diverges — a reset or reorg. `circulating_supply` is
 * maintained separately by the supply cron and is deliberately left intact.
 */
export async function resetIndexedChain(db: Database): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE ${txInExpanded}, ${txIn}, ${txOut}, ${coinsHistory}, ${transaction}, ${block}
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Rewind indexed data to a fork point: delete every row belonging to blocks with
 * `num > fork` (a shallow-reorg rollback), leaving the fork block and everything
 * below it intact. Runs in one transaction, deleting children before parents.
 *
 * Balances self-correct: removing the post-fork coins_history snapshots reverts
 * each touched address to its pre-fork snapshot, and an output spent in a
 * rolled-back block becomes unspent again (its spending tx_in is deleted). A
 * pre-fork snapshot can only reference pre-fork outputs, so nothing dangles.
 * Requires every affected snapshot to carry a block_num — callers must check
 * `coinsHistoryHasNullBlockNum` first and fall back to a full resync otherwise.
 */
export async function deleteFromHeight(db: Database, fork: number): Promise<void> {
  await db.transaction(async (tx) => {
    const doomedTx = sql`
      select ${transaction.hash} from ${transaction}
      where ${transaction.blockHash} in (select ${block.hash} from ${block} where ${block.num} > ${fork})`;
    await tx.execute(sql`delete from ${txInExpanded} where ${txInExpanded.txHash} in (${doomedTx})`);
    await tx.execute(sql`delete from ${txIn} where ${txIn.txHash} in (${doomedTx})`);
    await tx.execute(sql`delete from ${txOut} where ${txOut.txHash} in (${doomedTx})`);
    await tx.execute(sql`delete from ${transaction}
      where ${transaction.blockHash} in (select ${block.hash} from ${block} where ${block.num} > ${fork})`);
    await tx.execute(sql`delete from ${coinsHistory} where ${coinsHistory.blockNum} > ${fork}`);
    await tx.execute(sql`delete from ${block} where ${block.num} > ${fork}`);
  });
}

/**
 * Whether any coins_history row predates the block_num column (legacy NULL). A
 * reorg rewind can't safely delete such snapshots by block_num, so its presence
 * forces the full-resync fallback.
 */
export async function coinsHistoryHasNullBlockNum(db: Database): Promise<boolean> {
  const [row] = await db.select({ id: coinsHistory.id }).from(coinsHistory)
    .where(isNull(coinsHistory.blockNum)).limit(1);
  return row !== undefined;
}

export async function getLatestCoinsHistoryOutIds(db: Database, address: string): Promise<number[]> {
  const [row] = await db
    .select({ outIds: coinsHistory.outIds })
    .from(coinsHistory)
    .where(eq(coinsHistory.address, address))
    .orderBy(desc(coinsHistory.date), desc(coinsHistory.id))
    .limit(1);
  return (row?.outIds as number[] | undefined) ?? [];
}
