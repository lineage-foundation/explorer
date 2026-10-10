import { notFound } from "next/navigation";
import Link from "next/link";
import { getItem, getItemHolders, getItemTransfers } from "@explorer/db";
import {
  Card, Table, THead, TBody, TR, TH, TD, Mono, Pill, CopyButton, EmptyState,
} from "@explorer/ui";
import { getDb } from "../../../lib/db.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Pagination, parsePage } from "../../components/Pagination.js";
import { ItemMetadata } from "../../components/ItemMetadata.js";
import { absoluteTime, relativeTime, truncateHash } from "../../../lib/format.js";
import { groupDigits } from "../../../lib/detail.js";
import { swapHref } from "../../../lib/swap.js";
import { transferMoved } from "../../../lib/item.js";

// Holders and history change as the item moves; keep the cache window short.
export const revalidate = 20;
const PAGE_SIZE = 25;

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{label}</div>
      <div className="mt-1 font-mono text-xs text-text">{children}</div>
    </div>
  );
}

function Address({ address }: { address: string }) {
  return (
    <Link href={`/address/${address}`} className="text-link hover:text-link-hover">
      <Mono>{truncateHash(address, 8, 6)}</Mono>
    </Link>
  );
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export default async function ItemPage({
  params, searchParams,
}: {
  params: Promise<{ genesis: string }>;
  searchParams: Promise<{ page?: string; holders?: string }>;
}) {
  const genesis = decode((await params).genesis);
  if (genesis === null) notFound();
  const query = await searchParams;
  const historyPage = parsePage(query);
  const holdersPage = parsePage(query, "holders");
  const { db } = getDb();
  const [item, holders, history] = await Promise.all([
    getItem(db, genesis),
    getItemHolders(db, genesis, { limit: PAGE_SIZE, offset: (holdersPage - 1) * PAGE_SIZE }),
    getItemTransfers(db, genesis, { limit: PAGE_SIZE, offset: (historyPage - 1) * PAGE_SIZE }),
  ]);
  if (!item) notFound();
  const basePath = `/item/${encodeURIComponent(genesis)}`;
  const hasMetadata = item.metadata !== null && item.metadata.trim() !== "";

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow="Item" title={truncateHash(genesis, 10, 8)} />
        <div className="-mt-4 flex flex-wrap items-center gap-2 break-all font-mono text-sm text-text">
          {genesis} <CopyButton value={genesis} /> <Pill tone="item">item</Pill>
        </div>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetaItem label="Total minted">{groupDigits(item.totalAmount)}</MetaItem>
          <MetaItem label="Holders">{item.holderCount.toLocaleString("en-US")}</MetaItem>
          <MetaItem label="Creator">{item.creator ? <Address address={item.creator} /> : "—"}</MetaItem>
          <MetaItem label="Created in block">
            <Link href={`/block/${item.blockHash}`} className="text-link hover:text-link-hover">{`#${item.blockNum.toLocaleString("en-US")}`}</Link>
          </MetaItem>
          <MetaItem label="Created">{absoluteTime(item.timestamp)} <span className="text-text-subtle">({relativeTime(item.timestamp)})</span></MetaItem>
          <MetaItem label="Creation transaction">
            <Link href={`/transaction/${genesis}`} className="text-link hover:text-link-hover">{truncateHash(genesis, 8, 6)}</Link>
          </MetaItem>
        </div>
      </Card>

      {hasMetadata && (
        <section>
          <h2 className="mb-2 font-display text-lg text-text">Metadata</h2>
          <ItemMetadata metadata={item.metadata} />
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg text-text">Holders</h2>
        {holders.holders.length === 0
          ? <EmptyState title="No current holders" />
          : (
            <>
              <Table>
                <THead><TR><TH>Address</TH><TH>Quantity</TH></TR></THead>
                <TBody>
                  {holders.holders.map((h) => (
                    <TR key={h.address}>
                      <TD><Address address={h.address} /></TD>
                      <TD><Mono>{groupDigits(h.amount)}</Mono></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {(holdersPage > 1 || (holders.pagination.hasMore ?? false)) && (
                <Pagination
                  page={holdersPage} hasMore={holders.pagination.hasMore ?? false}
                  basePath={basePath} param="holders" query={{ page: query.page }}
                />
              )}
            </>
          )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg text-text">History</h2>
        {history.transfers.length === 0
          ? <EmptyState title="No transactions for this item" />
          : (
            <>
              <Table>
                <THead><TR><TH>Transaction</TH><TH>Block</TH><TH>From</TH><TH>To</TH><TH>Quantity</TH><TH>Age</TH></TR></THead>
                <TBody>
                  {history.transfers.map((t) => {
                    const sender = t.from[0];
                    // What left the sender: change kept by the sender is not part of the transfer.
                    const { recipients, quantity } = transferMoved(t);
                    const recipient = recipients[0];
                    return (
                      <TR key={t.txHash}>
                        <TD>
                          <Link href={`/transaction/${t.txHash}`} className="text-link hover:text-link-hover">
                            <Mono>{truncateHash(t.txHash)}</Mono>
                          </Link>
                          {t.druid !== null && (
                            <>
                              {" "}
                              <Link href={swapHref(t.druid)}><Pill tone="swap">swap</Pill></Link>
                            </>
                          )}
                        </TD>
                        <TD>
                          <Link href={`/block/${t.blockHash}`} className="text-link hover:text-link-hover">
                            <Mono>{`#${t.blockNum.toLocaleString("en-US")}`}</Mono>
                          </Link>
                        </TD>
                        <TD>
                          {t.created
                            ? <Pill tone="item">created</Pill>
                            : sender === undefined
                              ? <Mono className="text-text-subtle">unknown</Mono>
                              : (
                                <>
                                  <Address address={sender} />
                                  {t.from.length > 1 && <Mono className="ml-1 text-[0.6rem] text-text-subtle">{`+${t.from.length - 1}`}</Mono>}
                                </>
                              )}
                        </TD>
                        <TD>
                          {recipient === undefined
                            ? <Mono className="text-text-subtle">—</Mono>
                            : (
                              <>
                                <Address address={recipient} />
                                {recipients.length > 1 && <Mono className="ml-1 text-[0.6rem] text-text-subtle">{`+${recipients.length - 1}`}</Mono>}
                              </>
                            )}
                        </TD>
                        <TD><Mono>{groupDigits(quantity)}</Mono></TD>
                        <TD><span className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              {(historyPage > 1 || (history.pagination.hasMore ?? false)) && (
                <Pagination
                  page={historyPage} hasMore={history.pagination.hasMore ?? false}
                  basePath={basePath} query={{ holders: query.holders }}
                />
              )}
            </>
          )}
      </section>
    </div>
  );
}
