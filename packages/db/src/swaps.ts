import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { block, transaction } from "./schema.js";
import { loadTxDetails, type Pagination, type TxDetail } from "./queries.js";

/**
 * Two-way (DRUID) swaps.
 *
 * A swap is the set of transactions ("halves") sharing one DRUID. Each half's
 * `druidInfo.expectations` state what that half's party expects to receive: an
 * output paying `to` with exactly `asset`, in some other half. Legs are derived
 * from those expectations rather than from raw outputs, so change never shows
 * up as a leg.
 *
 * `expectation.from` is deliberately ignored: it is a hash over the paying
 * half's inputs, not a wallet address. A leg's sender is the paying half's
 * resolved input addresses instead.
 */

export interface SwapAsset {
  kind: "token" | "item";
  // Decimal string (raw token units, or an item quantity).
  amount: string;
  genesisHash: string | null;
  metadata: string | null;
}

export interface SwapLeg {
  // Input addresses of the half that pays this leg; null when no half does.
  from: string[] | null;
  to: string;
  asset: SwapAsset;
  // The half whose output satisfies the expectation; null when unmet.
  txHash: string | null;
  met: boolean;
}

export interface Swap {
  druid: string;
  participants: number;
  // Every expected half is indexed and every expectation is met.
  complete: boolean;
  blockNum: number;
  blockHash: string;
  timestamp: Date | null;
  legs: SwapLeg[];
  txHashes: string[];
}

export interface SwapHalf extends TxDetail {
  blockNum: number;
}

interface Expectation {
  to: string;
  asset: SwapAsset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A non-negative integer amount as a canonical decimal string, or null.
function amountString(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  return BigInt(value).toString();
}

function parseAsset(asset: unknown): SwapAsset | null {
  if (!isRecord(asset)) return null;
  if ("Token" in asset) {
    const amount = amountString(asset.Token);
    return amount === null ? null : { kind: "token", amount, genesisHash: null, metadata: null };
  }
  const item = asset.Item;
  if (!isRecord(item)) return null;
  const amount = amountString(item.amount);
  if (amount === null || typeof item.genesis_hash !== "string") return null;
  return {
    kind: "item", amount, genesisHash: item.genesis_hash,
    metadata: typeof item.metadata === "string" ? item.metadata : null,
  };
}

function parseExpectations(druidInfo: unknown): Expectation[] {
  if (!isRecord(druidInfo) || !Array.isArray(druidInfo.expectations)) return [];
  return druidInfo.expectations.flatMap((e: unknown) => {
    if (!isRecord(e) || typeof e.to !== "string") return [];
    const asset = parseAsset(e.asset);
    return asset ? [{ to: e.to, asset }] : [];
  });
}

function parseParticipants(halves: SwapHalf[]): number {
  for (const h of halves) {
    const p = isRecord(h.druidInfo) ? h.druidInfo.participants : undefined;
    if (typeof p === "number" && Number.isInteger(p) && p > 0) return p;
  }
  return halves.length;
}

function partyOf(half: SwapHalf): string[] {
  const seen = new Set<string>();
  for (const i of half.ins) if (i.fromAddress) seen.add(i.fromAddress);
  return [...seen];
}

function outputSatisfies(out: SwapHalf["outs"][number], want: Expectation): boolean {
  if (out.scriptPublicKey !== want.to || out.valueType !== want.asset.kind) return false;
  if (amountString(out.amount) !== want.asset.amount) return false;
  return want.asset.kind === "token" || out.genesisHash === want.asset.genesisHash;
}

/**
 * Build a swap from its indexed halves. Pure and total: malformed `druidInfo`
 * yields no legs and an incomplete swap, never an exception. `halves` must be
 * non-empty.
 */
export function buildSwap(druid: string, halves: SwapHalf[]): Swap {
  const ordered = [...halves].sort(
    (a, b) => a.blockNum - b.blockNum || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0),
  );
  // Each output can satisfy only one expectation.
  const claimed = new Set<string>();
  const legs: SwapLeg[] = [];
  for (const half of ordered) {
    for (const want of parseExpectations(half.druidInfo)) {
      let leg: SwapLeg = { from: null, to: want.to, asset: want.asset, txHash: null, met: false };
      search: for (const payer of ordered) {
        if (payer === half) continue;
        for (const out of payer.outs) {
          const key = `${payer.hash}:${out.n}`;
          if (claimed.has(key) || !outputSatisfies(out, want)) continue;
          claimed.add(key);
          leg = {
            from: partyOf(payer), to: want.to, txHash: payer.hash, met: true,
            asset: { ...want.asset, metadata: out.itemMetadata ?? want.asset.metadata },
          };
          break search;
        }
      }
      legs.push(leg);
    }
  }
  const participants = parseParticipants(ordered);
  const last = ordered.reduce((hi, h) => (h.blockNum > hi.blockNum ? h : hi));
  return {
    druid,
    participants,
    complete: ordered.length === participants && legs.length > 0 && legs.every((l) => l.met),
    blockNum: last.blockNum,
    blockHash: last.blockHash,
    timestamp: last.timestamp,
    legs,
    txHashes: ordered.map((h) => h.hash),
  };
}

export interface SwapWithHalves {
  swap: Swap;
  halves: SwapHalf[];
}

/**
 * Load the swaps for a set of DRUIDs in one pass: one query for the halves'
 * hashes, one batched detail load. DRUIDs with no indexed transaction are
 * simply absent from the result.
 */
export async function getSwapsByDruids(db: Database, druids: string[]): Promise<Map<string, SwapWithHalves>> {
  const wanted = [...new Set(druids)];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ hash: transaction.hash, druid: transaction.druid, blockNum: block.num })
    .from(transaction)
    .innerJoin(block, eq(block.hash, transaction.blockHash))
    .where(inArray(transaction.druid, wanted))
    .orderBy(asc(block.num), asc(transaction.id));
  const details = await loadTxDetails(db, rows.map((r) => r.hash));
  const detailByHash = new Map(details.map((d) => [d.hash, d]));
  const halvesByDruid = new Map<string, SwapHalf[]>();
  for (const r of rows) {
    const detail = detailByHash.get(r.hash);
    if (!detail || r.druid === null) continue;
    const bucket = halvesByDruid.get(r.druid) ?? [];
    bucket.push({ ...detail, blockNum: r.blockNum });
    halvesByDruid.set(r.druid, bucket);
  }
  const result = new Map<string, SwapWithHalves>();
  for (const [druid, halves] of halvesByDruid) {
    const swap = buildSwap(druid, halves);
    const byHash = new Map(halves.map((h) => [h.hash, h]));
    // Return the halves in the swap's own order.
    result.set(druid, { swap, halves: swap.txHashes.flatMap((h) => byHash.get(h) ?? []) });
  }
  return result;
}

export async function getSwapByDruid(db: Database, druid: string): Promise<SwapWithHalves | null> {
  return (await getSwapsByDruids(db, [druid])).get(druid) ?? null;
}

function clampPage(opts: { limit?: number; offset?: number }, fallback: number, max: number) {
  return {
    limit: Math.min(Math.max(Math.trunc(opts.limit ?? fallback), 1), max),
    offset: Math.max(Math.trunc(opts.offset ?? 0), 0),
  };
}

/**
 * A page of swaps, newest settlement first. The DRUID is the tiebreaker so
 * offset paging is stable when several swaps settle in one block.
 */
export async function getSwaps(
  db: Database,
  opts: { limit?: number; offset?: number },
): Promise<{ swaps: Swap[]; pagination: Pagination }> {
  const { limit, offset } = clampPage(opts, 25, 100);
  const totalRows = await db.execute<{ total: number }>(sql`
    select count(distinct t.druid)::int as total from ${transaction} t where t.druid is not null
  `);
  const total = totalRows[0]?.total ?? 0;
  if (total === 0) return { swaps: [], pagination: { total, limit, offset, hasMore: false } };
  const page = await db.execute<{ druid: string }>(sql`
    select t.druid
    from ${transaction} t
    inner join ${block} b on b.hash = t."blockHash"
    where t.druid is not null
    group by t.druid
    order by max(b.num) desc, t.druid asc
    limit ${limit} offset ${offset}
  `);
  const loaded = await getSwapsByDruids(db, page.map((r) => r.druid));
  return {
    swaps: page.flatMap((r) => loaded.get(r.druid)?.swap ?? []),
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
