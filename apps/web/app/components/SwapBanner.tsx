import Link from "next/link";
import { Card, Mono } from "@explorer/ui";
import { truncateHash } from "../../lib/format.js";
import { swapHref } from "../../lib/swap.js";

// Shown on a transaction that is one half of a two-way swap: links to the swap
// as a whole and to the other transactions settling it.
export function SwapBanner({ druid, counterparts }: { druid: string; counterparts: string[] }) {
  return (
    <Card className="p-4">
      <div className="font-display text-sm text-text">Half of a two-way swap</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs text-text-muted">
        <span>
          Swap{" "}
          <Link href={swapHref(druid)} className="text-link hover:text-link-hover">
            <Mono>{truncateHash(druid, 12, 6)}</Mono>
          </Link>
        </span>
        <span>
          Counterpart:{" "}
          {counterparts.length === 0
            ? <span className="text-text-subtle">none indexed</span>
            : counterparts.map((hash, i) => (
              <span key={hash}>
                {i > 0 && ", "}
                <Link href={`/transaction/${hash}`} className="text-link hover:text-link-hover">
                  <Mono>{truncateHash(hash, 8, 6)}</Mono>
                </Link>
              </span>
            ))}
        </span>
      </div>
    </Card>
  );
}
