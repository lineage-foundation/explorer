import Link from "next/link";
import { getAccountBalance, getAccountTransactions } from "@explorer/db";
import {
  Stat, Table, THead, TBody, TR, TH, TD, Mono, CopyButton, EmptyState,
} from "@explorer/ui";
import { TOKEN_TICKER } from "@explorer/config";
import { getDb } from "../../../lib/db.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Pagination, parsePage } from "../../components/Pagination.js";
import { formatLngx, relativeTime, truncateHash } from "../../../lib/format.js";

export const revalidate = 20;
const PAGE_SIZE = 25;

export default async function AddressPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = parsePage(await searchParams);
  const { db } = getDb();
  const [{ balance }, { transactions, pagination }] = await Promise.all([
    getAccountBalance(db, id),
    getAccountTransactions(db, id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Address" title={truncateHash(id, 10, 8)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-md flex-1"><Stat label="Balance" value={formatLngx(balance)} unit={TOKEN_TICKER} /></div>
        <span className="break-all font-mono text-xs text-text-subtle">
          {id}
          {" "}
          <CopyButton value={id} />
        </span>
      </div>
      <section>
        <h2 className="mb-2 font-display text-lg text-text">Transactions</h2>
        {transactions.length === 0
          ? <EmptyState title="No transactions for this address" />
          : (
            <>
              <Table>
                <THead><TR><TH>Transaction</TH><TH>Block</TH><TH>Age</TH></TR></THead>
                <TBody>
                  {transactions.map((t) => (
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
                      <TD><span className="text-text-muted">{relativeTime(t.timestamp)}</span></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} hasMore={pagination.hasMore ?? false} basePath={`/address/${id}`} />
            </>
          )}
      </section>
    </div>
  );
}
