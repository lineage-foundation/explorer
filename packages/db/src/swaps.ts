import type { TxDetail } from "./queries.js";

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
