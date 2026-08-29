import { getTransactions } from "@explorer/db";
import { EmptyState } from "@explorer/ui";
import { getDb } from "../../lib/db.js";
import { PageHeader } from "../components/PageHeader.js";
import { Pagination, parsePage } from "../components/Pagination.js";
import { TxTable } from "../components/TxTable.js";

const PAGE_SIZE = 25;

export default async function TransactionsPage(
  { searchParams }: { searchParams: Promise<{ page?: string }> },
) {
  const page = parsePage(await searchParams);
  const { db } = getDb();
  const { transactions, pagination } = await getTransactions(db, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return (
    <div>
      <PageHeader eyebrow="Chain" title="Transactions" />
      {transactions.length === 0
        ? <EmptyState title="No transactions yet" />
        : (
          <>
            <TxTable txs={transactions} />
            <Pagination page={page} hasMore={pagination.hasMore ?? false} basePath="/transactions" />
          </>
        )}
    </div>
  );
}
