import { getItems } from "@explorer/db";
import {
  Table, THead, TBody, TR, TH, TD, Mono, EmptyState,
} from "@explorer/ui";
import { getDb } from "../../lib/db.js";
import { PageHeader } from "../components/PageHeader.js";
import { Pagination, parsePage } from "../components/Pagination.js";
import { ItemLink } from "../components/ItemLink.js";
import { relativeTime } from "../../lib/format.js";
import { groupDigits } from "../../lib/detail.js";
import { metadataPreview } from "../../lib/item.js";

export const revalidate = 20;
const PAGE_SIZE = 25;
const MAX_QUERY = 128;

export default async function ItemsPage(
  { searchParams }: { searchParams: Promise<{ page?: string; q?: string | string[] }> },
) {
  const query = await searchParams;
  const page = parsePage(query);
  const rawQ = Array.isArray(query.q) ? query.q[0] : query.q;
  const q = rawQ?.trim().slice(0, MAX_QUERY) || undefined;
  const { db } = getDb();
  const { items, pagination } = await getItems(db, { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  return (
    <div>
      <PageHeader eyebrow="Chain" title="Items" />
      {/* A plain GET form: the search works without client-side JavaScript. */}
      <form action="/items" method="get" className="mb-4 flex gap-2">
        <input
          type="search" name="q" defaultValue={q ?? ""} maxLength={MAX_QUERY}
          placeholder="Search item metadata" aria-label="Search item metadata"
          className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text placeholder:text-text-subtle"
        />
        <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text">
          Search
        </button>
      </form>
      {items.length === 0
        ? <EmptyState title={q ? "No items match" : "No items yet"} />
        : (
          <>
            <Table>
              <THead><TR><TH>Item</TH><TH>Metadata</TH><TH>Minted</TH><TH>Holders</TH><TH>Age</TH></TR></THead>
              <TBody>
                {items.map((item) => (
                  <TR key={item.genesisHash}>
                    <TD><ItemLink genesis={item.genesisHash} /></TD>
                    <TD><Mono className="break-all text-xs text-text-muted">{metadataPreview(item.metadata)}</Mono></TD>
                    <TD><Mono>{groupDigits(item.totalAmount)}</Mono></TD>
                    <TD><Mono>{item.holderCount.toLocaleString("en-US")}</Mono></TD>
                    <TD><span className="text-text-muted">{relativeTime(item.timestamp)}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} hasMore={pagination.hasMore ?? false} basePath="/items" query={{ q }} />
          </>
        )}
    </div>
  );
}
