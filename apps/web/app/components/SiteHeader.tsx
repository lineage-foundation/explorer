import Link from "next/link";
import { TOKEN_DISPLAY_NAME, IS_TESTNET } from "@explorer/config";
import { SearchBar } from "./SearchBar.js";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand/lineage-mark.svg" alt="" width={24} height={24} />
          <span className="font-display font-semibold tracking-tight text-text">{TOKEN_DISPLAY_NAME}</span>
          <span className="text-xs text-text-subtle">Explorer</span>
          {IS_TESTNET
            ? (
              <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-amber-400">
                Testnet
              </span>
            )
            : null}
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
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
