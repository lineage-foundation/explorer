import type { Database } from "@explorer/db";
import {
  getBlockHashByNum, getBlockByHashOrNumber, getTransactionByHash, getAccountBalance,
} from "@explorer/db";
import { classify } from "./search.js";
import { truncateHash, formatLngx } from "./format.js";

export interface Suggestion {
  kind: "block" | "tx" | "address";
  label: string;
  sublabel?: string;
  href: string;
  found: boolean;
}

export async function resolveSearch(db: Database, query: string): Promise<Suggestion[]> {
  const q = query.trim();
  const { kind } = classify(q);

  if (kind === "block-num") {
    const n = Number.parseInt(q, 10);
    const hash = await getBlockHashByNum(db, n);
    const found = hash !== null;
    return [{
      kind: "block", label: `Block #${n.toLocaleString()}`, href: `/block/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "block-hash") {
    const block = await getBlockByHashOrNumber(db, q);
    const found = block !== null;
    return [{
      kind: "block",
      label: found ? `Block #${block.num.toLocaleString()}` : `Block ${truncateHash(q)}`,
      href: `/block/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "tx") {
    const tx = await getTransactionByHash(db, q);
    const found = tx !== null;
    return [{
      kind: "tx", label: `Transaction ${truncateHash(q)}`, href: `/transaction/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "address") {
    const { balance } = await getAccountBalance(db, q);
    return [{
      kind: "address", label: `Address ${truncateHash(q)}`,
      sublabel: `${formatLngx(balance, 2)} LNGX`, href: `/address/${q}`, found: true,
    }];
  }
  return [];
}
