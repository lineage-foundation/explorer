import Link from "next/link";
import type { TxListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono, Pill,
} from "@explorer/ui";
import { relativeTime, truncateHash, txTypeLabel } from "../../lib/format.js";

export function TxTable({ txs }: { txs: TxListItem[] }) {
  return (
    <Table fixed>
      <colgroup>
        <col style={{ width: "42%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "24%" }} />
      </colgroup>
      <THead><TR><TH>Transaction</TH><TH>Block</TH><TH>Type</TH><TH right>Age</TH></TR></THead>
      <TBody>
        {txs.map((t) => {
          const label = txTypeLabel(t.txType, false);
          return (
            <TR key={t.hash}>
              <TD className="truncate">
                <Link href={`/transaction/${t.hash}`} className="text-link hover:text-link-hover">
                  <Mono>{truncateHash(t.hash)}</Mono>
                </Link>
              </TD>
              <TD>
                <Link href={`/block/${t.blockNum}`} className="text-link hover:text-link-hover">
                  <Mono>{`#${t.blockNum.toLocaleString()}`}</Mono>
                </Link>
              </TD>
              <TD><Pill tone={label === "unknown" ? "neutral" : label}>{label}</Pill></TD>
              <TD right><span suppressHydrationWarning className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
