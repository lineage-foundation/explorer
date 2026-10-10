import type { Swap, TxDetail } from "@explorer/db";
import { formatAsset, legsForAddress } from "./swap.js";

/**
 * Net token amount a transaction moved for a specific address: the value of its
 * token outputs paying the address, minus the value of the inputs it spent from
 * the address. Positive = received, negative = sent. This is well-defined per
 * address even though a transaction's whole "amount sent" is ambiguous (change
 * goes to a fresh, unidentifiable address). Returned as raw token units.
 */
export function netForAddress(tx: TxDetail, address: string): bigint {
  const received = tx.outs
    .filter((o) => o.valueType === "token" && o.scriptPublicKey === address)
    .reduce((sum, o) => sum + (o.amount ? BigInt(o.amount) : 0n), 0n);
  const spent = tx.ins
    // Token inputs only: a spent item's quantity is not a token amount.
    .filter((i) => i.fromAddress === address && i.valueType !== "item")
    .reduce((sum, i) => sum + (i.amount ? BigInt(i.amount) : 0n), 0n);
  return received - spent;
}

/**
 * What a swap did for one address, as ledger lines: each asset it gave (−),
 * then each asset it received (+). Unlike a token net, this covers items too.
 */
export function swapLinesForAddress(
  swap: Pick<Swap, "legs">,
  address: string,
): { sign: "+" | "−"; text: string }[] {
  const { gave, received } = legsForAddress(swap, address);
  return [
    ...gave.map((l) => ({ sign: "−" as const, text: formatAsset(l.asset) })),
    ...received.map((l) => ({ sign: "+" as const, text: formatAsset(l.asset) })),
  ];
}
