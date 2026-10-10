import Link from "next/link";

// `param` names the query parameter that carries the page (so one page can hold
// two independently paged lists); `query` holds other values to keep in the
// link, such as a search term or the other list's page.
export function Pagination(
  { page, hasMore, basePath, param = "page", query = {} }: {
    page: number; hasMore: boolean; basePath: string; param?: string; query?: Record<string, string | undefined>;
  },
) {
  const href = (target: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key !== param && value !== undefined && value !== "") params.set(key, value);
    }
    params.set(param, String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1
        ? (
          <Link
            href={href(page - 1)}
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
            href={href(page + 1)}
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

export function parsePage(
  searchParams: Record<string, string | string[] | undefined>,
  param = "page",
): number {
  const value = searchParams[param];
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}
