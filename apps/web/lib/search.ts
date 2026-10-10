export type SearchKind = "block-hash" | "block-num" | "tx" | "address" | "swap" | "unknown";

// The DRUID format the SDKs generate. DRUIDs are client-chosen, so a swap with
// another shape is still reachable by its URL; it just isn't recognised here.
export const DRUID_RE = /^DRUID0x[a-fA-F0-9]{32}$/;

export function classify(query: string): { kind: SearchKind; href: string | null } {
  const q = query.trim();
  if (q === "") return { kind: "unknown", href: null };
  if (/^[0-9]+$/.test(q)) return { kind: "block-num", href: `/block/${q}` };
  if (/^b[a-fA-F0-9]{64}$/.test(q)) return { kind: "block-hash", href: `/block/${q}` };
  if (/^g[a-fA-F0-9]{31}$/.test(q)) return { kind: "tx", href: `/transaction/${q}` };
  if (/^[a-fA-F0-9]{64}$/.test(q)) return { kind: "address", href: `/address/${q}` };
  if (DRUID_RE.test(q)) return { kind: "swap", href: `/trade/${q}` };
  return { kind: "unknown", href: null };
}
