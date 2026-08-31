import type { Database } from "@explorer/db";
import { getBlockHashByNum, searchByPrefix } from "@explorer/db";
import { truncateHash } from "./format.js";

export interface Suggestion {
  kind: "block" | "tx" | "address";
  label: string;
  sublabel?: string;
  href: string;
  found: boolean;
}

// Minimum characters before a prefix search runs (a shorter prefix matches too
// much to be useful), and the maximum number of suggestions returned.
const MIN_PREFIX = 4;
const LIMIT = 8;

export async function resolveSearch(db: Database, query: string): Promise<Suggestion[]> {
  const q = query.trim();
  if (q === "") return [];

  // Pure-numeric input is a block number (exact).
  if (/^[0-9]+$/.test(q)) {
    const hash = await getBlockHashByNum(db, Number.parseInt(q, 10));
    const found = hash !== null;
    return [{
      kind: "block", label: `Block #${Number.parseInt(q, 10).toLocaleString()}`, href: `/block/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }

  if (q.length < MIN_PREFIX) return [];

  const { blocks, transactions, addresses } = await searchByPrefix(db, q, LIMIT);
  const suggestions: Suggestion[] = [
    ...blocks.map((b) => ({
      kind: "block" as const, label: `Block #${b.num.toLocaleString()}`,
      sublabel: truncateHash(b.hash), href: `/block/${b.hash}`, found: true,
    })),
    ...transactions.map((t) => ({
      kind: "tx" as const, label: `Transaction ${truncateHash(t.hash)}`, href: `/transaction/${t.hash}`, found: true,
    })),
    ...addresses.map((a) => ({
      kind: "address" as const, label: `Address ${truncateHash(a.address)}`, href: `/address/${a.address}`, found: true,
    })),
  ];

  // Any complete 64-hex string is a viewable address even with no output yet.
  if (/^[a-f0-9]{64}$/i.test(q) && !suggestions.some((s) => s.kind === "address" && s.href === `/address/${q}`)) {
    suggestions.push({
      kind: "address", label: `Address ${truncateHash(q)}`, href: `/address/${q}`, found: true,
    });
  }

  return suggestions.slice(0, LIMIT);
}
