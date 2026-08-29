import Link from "next/link";
import type { BlockListItem } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono,
} from "@explorer/ui";
import { relativeTime } from "../../lib/format.js";

export function BlockTable({ blocks }: { blocks: BlockListItem[] }) {
  return (
    <Table>
      <THead><TR><TH>Block</TH><TH>Age</TH><TH>Txns</TH></TR></THead>
      <TBody>
        {blocks.map((b) => (
          <TR key={b.hash}>
            <TD>
              <Link href={`/block/${b.num}`} className="text-link hover:text-link-hover">
                <Mono>
                  #
                  {b.num.toLocaleString()}
                </Mono>
              </Link>
            </TD>
            <TD><span suppressHydrationWarning className="text-text-muted">{relativeTime(b.timestamp)}</span></TD>
            <TD><Mono>{b.nbTx ?? 0}</Mono></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
