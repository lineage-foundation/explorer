import Link from "next/link";
import type { ActivityItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono, Pill,
} from "@explorer/ui";
import { relativeTime, truncateHash, txTypeLabel, formatLngx } from "../../lib/format.js";
import { summarise, swapHref } from "../../lib/swap.js";

// One row per ordinary transaction and one row per two-way swap.
export function TxTable({ txs }: { txs: ActivityItem[] }) {
  return (
    <Table fixed>
      <colgroup>
        <col style={{ width: "34%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "15%" }} />
      </colgroup>
      <THead>
        <TR><TH>Transaction</TH><TH>Block</TH><TH>Amount</TH><TH>Type</TH><TH>Age</TH></TR>
      </THead>
      <TBody>
        {txs.map((t) => {
          if (t.kind === "swap") {
            return (
              <TR key={`swap:${t.druid}`}>
                <TD className="truncate">
                  <Link href={swapHref(t.druid)} className="text-link hover:text-link-hover">
                    <Mono>{truncateHash(t.druid, 10, 4)}</Mono>
                  </Link>
                </TD>
                <TD>
                  <Link href={`/block/${t.blockNum}`} className="text-link hover:text-link-hover">
                    <Mono>{`#${t.blockNum.toLocaleString()}`}</Mono>
                  </Link>
                </TD>
                <TD className="truncate"><Mono>{summarise(t)}</Mono></TD>
                <TD><Pill tone="swap">trade</Pill></TD>
                <TD><span suppressHydrationWarning className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
              </TR>
            );
          }
          const label = txTypeLabel(t.txType, false);
          return (
            <TR key={`tx:${t.hash}`}>
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
              <TD><Mono>{t.value === null ? "—" : formatLngx(t.value, 2)}</Mono></TD>
              <TD><Pill tone={label === "unknown" ? "neutral" : label}>{label}</Pill></TD>
              <TD><span suppressHydrationWarning className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
