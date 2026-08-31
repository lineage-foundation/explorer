import Link from "next/link";
import type { BlockListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono,
} from "@explorer/ui";
import { relativeTime, truncateHash, formatLngx } from "../../lib/format.js";

export function BlockTable({ blocks }: { blocks: BlockListItem[] }) {
  return (
    <Table fixed>
      <colgroup>
        <col style={{ width: "14%" }} />
        <col style={{ width: "32%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "19%" }} />
      </colgroup>
      <THead>
        <TR><TH>Block</TH><TH>Hash</TH><TH>Txns</TH><TH>Reward</TH><TH>Age</TH></TR>
      </THead>
      <TBody>
        {blocks.map((b) => (
          <TR key={b.hash}>
            <TD>
              <Link href={`/block/${b.num}`} className="text-link hover:text-link-hover">
                <Mono>{`#${b.num.toLocaleString()}`}</Mono>
              </Link>
            </TD>
            <TD className="truncate">
              <Link href={`/block/${b.hash}`} className="text-link hover:text-link-hover">
                <Mono>{truncateHash(b.hash)}</Mono>
              </Link>
            </TD>
            <TD><Mono>{b.nbTx ?? 0}</Mono></TD>
            <TD><Mono>{b.reward === null ? "—" : formatLngx(b.reward, 2)}</Mono></TD>
            <TD><span suppressHydrationWarning className="text-text-muted">{relativeTime(b.timestamp)}</span></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
