// Pure helpers for the block/transaction detail pages.

/**
 * Decode a block's unicorn seed (a byte array from the node's `seed_value`) into
 * its seed and witness parts. The decoded string is `"<seed>-<witness>"`; the
 * witness is everything after the first dash. Returns null for absent/garbled
 * seeds so the caller can hide the fields.
 */
export function decodeUnicorn(seed: unknown): { seed: string; witness: string } | null {
  if (!Array.isArray(seed) || seed.length === 0) return null;
  let s = "";
  for (const c of seed) {
    if (typeof c !== "number") return null;
    s += String.fromCharCode(c);
  }
  const dash = s.indexOf("-");
  if (dash === -1) return { seed: s, witness: "" };
  return { seed: s.slice(0, dash), witness: s.slice(dash + 1) };
}

export interface StackItem { type: string; value: string }

/**
 * Normalise a script signature's stack into {type, value} display items. Each
 * stack entry from the node is a single-key object (`{ Bytes }`, `{ Op }`,
 * `{ Num }`, `{ Signature }`, `{ PubKey }`, …); we surface the key as the type.
 */
export function scriptStack(sig: unknown): StackItem[] {
  if (!sig || typeof sig !== "object") return [];
  const stack = (sig as { stack?: unknown }).stack;
  if (!Array.isArray(stack)) return [];
  return stack.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const entry = Object.entries(item as Record<string, unknown>)[0];
      if (entry) {
        const [type, value] = entry;
        return { type, value: typeof value === "string" ? value : JSON.stringify(value) };
      }
    }
    return { type: "raw", value: typeof item === "string" ? item : JSON.stringify(item) };
  });
}

/** Group a non-negative integer string with thousands separators. */
export function groupDigits(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** JSON.stringify replacer that renders BigInt values as strings. */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
