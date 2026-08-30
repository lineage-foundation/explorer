import Link from "next/link";
import type { BlockListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono,
} from "@explorer/ui";
import { relativeTime, truncateHash } from "../../lib/format.js";

export function BlockTable({ blocks }: { blocks: BlockListItem[] }) {
  return (
    <Table fixed>
      <colgroup>
        <col style={{ width: "20%" }} />
        <col style={{ width: "40%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "24%" }} />
      </colgroup>
      <THead><TR><TH>Block</TH><TH>Hash</TH><TH right>Txns</TH><TH right>Age</TH></TR></THead>
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
            <TD right><Mono>{b.nbTx ?? 0}</Mono></TD>
            <TD right><span suppressHydrationWarning className="text-text-muted">{relativeTime(b.timestamp)}</span></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
