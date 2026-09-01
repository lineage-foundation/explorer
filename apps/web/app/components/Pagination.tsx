import Link from "next/link";

export function Pagination(
  { page, hasMore, basePath }: { page: number; hasMore: boolean; basePath: string },
) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1
        ? (
          <Link
            href={`${basePath}?page=${page - 1}`}
            className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
          >
            ← Prev
          </Link>
        )
        : (
          <span className="rounded-md border border-border/50 px-3 py-1.5 text-text-subtle">
            ← Prev
          </span>
        )}
      <span className="font-mono text-text-subtle">
        Page
        {" "}
        {page}
      </span>
      {hasMore
        ? (
          <Link
            href={`${basePath}?page=${page + 1}`}
            className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
          >
            Next →
          </Link>
        )
        : (
          <span className="rounded-md border border-border/50 px-3 py-1.5 text-text-subtle">
            Next →
          </span>
        )}
    </div>
  );
}

// Cap the page so a public `?page=999999999` can't drive an unbounded SQL
// OFFSET. With PAGE_SIZE 25 this bounds offset at ~100k rows, matching the API's
// deep-offset cap.
const MAX_PAGE = 4000;

export function parsePage(searchParams: { page?: string | string[] }): number {
  const raw = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}
