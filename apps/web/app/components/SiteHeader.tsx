import Link from "next/link";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand/lineage-mark.svg" alt="" width={24} height={24} />
          <span className="font-display font-semibold tracking-tight text-text">{TOKEN_DISPLAY_NAME}</span>
          <span className="text-xs text-text-subtle">Explorer</span>
        </Link>
        <nav className="ml-2 hidden gap-4 text-sm text-text-muted sm:flex">
          <Link href="/blocks" className="hover:text-text">
            Blocks
          </Link>
          <Link href="/transactions" className="hover:text-text">
            Transactions
          </Link>
        </nav>
        <div className="ml-auto w-full max-w-sm">
          {/* SearchBar mounts here in Task 5 */}
          <input
            disabled
            placeholder="Search block / tx / address…"
            className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-xs text-text-subtle"
          />
        </div>
      </div>
    </header>
  );
}
