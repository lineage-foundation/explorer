import type { TxDetail } from "@explorer/db";

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
    .filter((i) => i.fromAddress === address)
    .reduce((sum, i) => sum + (i.amount ? BigInt(i.amount) : 0n), 0n);
  return received - spent;
}
