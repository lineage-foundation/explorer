import Link from "next/link";
import type { Swap } from "@explorer/db";
import { truncateHash } from "../../lib/format.js";
import { AssetAmount } from "./AssetAmount.js";

function Address({ address }: { address: string }) {
  return (
    <Link href={`/address/${address}`} className="font-mono text-xs text-link hover:text-link-hover">
      {truncateHash(address, 8, 6)}
    </Link>
  );
}

// The sender of a leg is the paying transaction's input addresses. A party can
// hold several; show the first and count the rest.
function Sender({ from }: { from: string[] | null }) {
  const first = from?.[0];
  if (first === undefined) return <span className="font-mono text-xs text-text-subtle">unknown</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Address address={first} />
      {from !== null && from.length > 1 && (
        <span className="font-mono text-[0.6rem] text-text-subtle">{`+${from.length - 1}`}</span>
      )}
    </span>
  );
}

// Who gave what to whom, one row per leg.
export function SwapSummary({ swap }: { swap: Pick<Swap, "legs"> }) {
  if (swap.legs.length === 0) {
    return <div className="px-2 py-1.5 text-sm text-text-subtle">No legs could be derived for this trade.</div>;
  }
  return (
    <div className="rounded-md border border-border bg-surface p-2">
      {swap.legs.map((leg, i) => (
        <div key={i} className="mb-1.5 flex flex-wrap items-center justify-between gap-3 rounded bg-bg-raised px-2 py-2 last:mb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sender from={leg.from} />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-text-subtle">gave</span>
            <AssetAmount asset={leg.asset} />
            <span className="text-accent">→</span>
            <Address address={leg.to} />
          </div>
          <span className={`font-mono text-[0.6rem] uppercase tracking-[0.06em] ${leg.met ? "text-accent" : "text-warning"}`}>
            {leg.met ? "met" : "not met"}
          </span>
        </div>
      ))}
    </div>
  );
}
