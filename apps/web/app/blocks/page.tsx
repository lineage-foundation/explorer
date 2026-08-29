import { getBlocks } from "@explorer/db";
import { EmptyState } from "@explorer/ui";
import { getDb } from "../../lib/db.js";
import { BlockTable } from "../components/BlockTable.js";
import { PageHeader } from "../components/PageHeader.js";
import { Pagination, parsePage } from "../components/Pagination.js";

export const revalidate = 20;
const PAGE_SIZE = 25;

export default async function BlocksPage(
  { searchParams }: { searchParams: Promise<{ page?: string }> },
) {
  const page = parsePage(await searchParams);
  const { db } = getDb();
  const { blocks, pagination } = await getBlocks(db, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  return (
    <div>
      <PageHeader eyebrow="Chain" title="Blocks" />
      {blocks.length === 0
        ? <EmptyState title="No blocks yet" />
        : (
          <>
            <BlockTable blocks={blocks} />
            <Pagination page={page} hasMore={pagination.hasMore ?? false} basePath="/blocks" />
          </>
        )}
    </div>
  );
}
