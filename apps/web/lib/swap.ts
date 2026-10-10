import type { Swap, SwapAsset, SwapLeg } from "@explorer/db";
import { TOKEN_TICKER } from "@explorer/config";
import { formatLngx } from "./format.js";

// Presentation helpers for two-way swaps. Pure and free of runtime database
// imports, so they are safe inside client components (the home feed).

/** Link to a swap's page. DRUIDs are client-chosen strings, so always encode. */
export function swapHref(druid: string): string {
  return `/trade/${encodeURIComponent(druid)}`;
}

/** "1 item" / "3 items" for an item, "<amount> LNGX" for a token. */
export function formatAsset(asset: SwapAsset): string {
  if (asset.kind === "item") {
    const count = /^[0-9]+$/.test(asset.amount) ? BigInt(asset.amount).toLocaleString("en-US") : asset.amount;
    return `${count} ${asset.amount === "1" ? "item" : "items"}`;
  }
  return `${formatLngx(asset.amount)} ${TOKEN_TICKER}`;
}

/** One-line description of a swap for list rows: its legs' assets, joined. */
export function summarise(swap: Pick<Swap, "legs">): string {
  return swap.legs.length === 0 ? "—" : swap.legs.map((l) => formatAsset(l.asset)).join(" ⇄ ");
}

/** The legs an address paid and the legs paid to it. */
export function legsForAddress(
  swap: Pick<Swap, "legs">,
  address: string,
): { gave: SwapLeg[]; received: SwapLeg[] } {
  return {
    gave: swap.legs.filter((l) => l.from?.includes(address) ?? false),
    received: swap.legs.filter((l) => l.to === address),
  };
}

export type SwapGroup<T> =
  | { kind: "tx"; row: T }
  | { kind: "swap"; druid: string; rows: T[] };

/**
 * Collapse rows that share a DRUID into one group, placed where the first of
 * them appeared. For lists that are not paginated (a block's transactions);
 * paginated lists are grouped in SQL instead.
 */
export function groupBySwap<T extends { druid: string | null }>(rows: T[]): SwapGroup<T>[] {
  const groups: SwapGroup<T>[] = [];
  const swapByDruid = new Map<string, T[]>();
  for (const row of rows) {
    if (row.druid === null) {
      groups.push({ kind: "tx", row });
      continue;
    }
    const existing = swapByDruid.get(row.druid);
    if (existing) {
      existing.push(row);
      continue;
    }
    const bucket = [row];
    swapByDruid.set(row.druid, bucket);
    groups.push({ kind: "swap", druid: row.druid, rows: bucket });
  }
  return groups;
}
