import Link from "next/link";
import { getAccountBalance, getAccountActivity } from "@explorer/db";
import {
  Stat, Table, THead, TBody, TR, TH, TD, Mono, Pill, CopyButton, EmptyState,
} from "@explorer/ui";
import { TOKEN_TICKER } from "@explorer/config";
import { getDb } from "../../../lib/db.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Pagination, parsePage } from "../../components/Pagination.js";
import { formatLngx, relativeTime, truncateHash } from "../../../lib/format.js";
import { netForAddress, swapLinesForAddress } from "../../../lib/tx.js";
import { swapHref } from "../../../lib/swap.js";
import { groupDigits } from "../../../lib/detail.js";

export const revalidate = 20;
const PAGE_SIZE = 25;

export default async function AddressPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = parsePage(await searchParams);
  const { db } = getDb();
  const [{ balance }, { items, pagination }] = await Promise.all([
    getAccountBalance(db, id),
    getAccountActivity(db, id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Address" title={truncateHash(id, 10, 8)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-md flex-1">
          <Stat label="Balance" value={formatLngx(balance)} unit={TOKEN_TICKER} />
          <div className="mt-1 font-mono text-[0.6rem] text-text-subtle">{groupDigits(balance)} fractionated</div>
        </div>
        <span className="break-all font-mono text-xs text-text-subtle">
          {id}
          {" "}
          <CopyButton value={id} />
        </span>
      </div>
      <section>
        <h2 className="mb-2 font-display text-lg text-text">Transactions</h2>
        {items.length === 0
          ? <EmptyState title="No transactions for this address" />
          : (
            <>
              <Table>
                <THead><TR><TH>Transaction</TH><TH>Block</TH><TH>Amount</TH><TH>Balance</TH><TH>Age</TH></TR></THead>
                <TBody>
                  {items.map((entry) => {
                    const t = entry.txs[0];
                    if (!t) return null;
                    if (entry.kind === "swap" && entry.swap) {
                      // A two-way swap is one entry: what this address gave and received.
                      const lines = swapLinesForAddress(entry.swap, id);
                      return (
                        <TR key={entry.swap.druid}>
                          <TD>
                            <Link href={swapHref(entry.swap.druid)} className="text-link hover:text-link-hover">
                              <Mono>{truncateHash(entry.swap.druid, 10, 4)}</Mono>
                            </Link>{" "}
                            <Pill tone="swap">swap</Pill>
                          </TD>
                          <TD>
                            <Link href={`/block/${t.blockHash}`} className="text-link hover:text-link-hover">
                              <Mono>{truncateHash(t.blockHash, 6, 4)}</Mono>
                            </Link>
                          </TD>
                          <TD>
                            {lines.length === 0
                              ? <Mono className="text-text-subtle">—</Mono>
                              : lines.map((line, i) => (
                                <div key={i}>
                                  <Mono className={line.sign === "+" ? "text-accent" : "text-text-muted"}>
                                    {`${line.sign}${line.text}`}
                                  </Mono>
                                </div>
                              ))}
                          </TD>
                          <TD><Mono className="text-text-muted">{formatLngx(entry.balanceAfter, 2)}</Mono></TD>
                          <TD><span className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
                        </TR>
                      );
                    }
                    // Net for THIS address: what it received minus what it spent.
                    const net = netForAddress(t, id);
                    const abs = (net < 0n ? -net : net).toString();
                    return (
                      <TR key={t.hash}>
                        <TD>
                          <Link href={`/transaction/${t.hash}`} className="text-link hover:text-link-hover">
                            <Mono>{truncateHash(t.hash)}</Mono>
                          </Link>
                        </TD>
                        <TD>
                          <Link href={`/block/${t.blockHash}`} className="text-link hover:text-link-hover">
                            <Mono>{truncateHash(t.blockHash, 6, 4)}</Mono>
                          </Link>
                        </TD>
                        <TD>
                          <Mono className={net > 0n ? "text-accent" : net < 0n ? "text-text-muted" : "text-text-subtle"}>
                            {net === 0n ? "—" : `${net > 0n ? "+" : "−"}${formatLngx(abs, 2)} ${TOKEN_TICKER}`}
                          </Mono>
                        </TD>
                        <TD><Mono className="text-text-muted">{formatLngx(t.balanceAfter, 2)}</Mono></TD>
                        <TD><span className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <Pagination page={page} hasMore={pagination.hasMore ?? false} basePath={`/address/${id}`} />
            </>
          )}
      </section>
    </div>
  );
}
