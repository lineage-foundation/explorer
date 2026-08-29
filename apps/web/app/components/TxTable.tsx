import Link from "next/link";
import type { TxListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono, Pill,
} from "@explorer/ui";
import { relativeTime, truncateHash, txTypeLabel } from "../../lib/format.js";

export function TxTable({ txs }: { txs: TxListItem[] }) {
  return (
    <Table>
      <THead><TR><TH>Transaction</TH><TH>Age</TH><TH>Type</TH></TR></THead>
      <TBody>
        {txs.map((t) => {
          const label = txTypeLabel(t.txType, false);
          return (
            <TR key={t.hash}>
              <TD>
                <Link href={`/transaction/${t.hash}`} className="text-link hover:text-link-hover">
                  <Mono>{truncateHash(t.hash)}</Mono>
                </Link>
              </TD>
              <TD><span className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
              <TD><Pill tone={label === "unknown" ? "neutral" : label}>{label}</Pill></TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
