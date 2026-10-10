import { notFound } from "next/navigation";
import Link from "next/link";
import { getSwapByDruid, getMaxBlockNum } from "@explorer/db";
import { Card, Pill, CopyButton } from "@explorer/ui";
import { getDb } from "../../../lib/db.js";
import { PageHeader } from "../../components/PageHeader.js";
import { SwapSummary } from "../../components/SwapSummary.js";
import { InputsOutputs } from "../../components/InputsOutputs.js";
import { absoluteTime, relativeTime, truncateHash, confirmations } from "../../../lib/format.js";

// Short ISR window: the confirmation count is tip-relative. See transaction/[id]/page.tsx.
export const revalidate = 20;

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{label}</div>
      <div className="mt-1 font-mono text-xs text-text">{children}</div>
    </div>
  );
}

// DRUIDs are chosen by clients, so the segment may hold anything; a malformed
// escape sequence is simply an unknown swap.
function decodeDruid(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export default async function SwapPage({ params }: { params: Promise<{ druid: string }> }) {
  const druid = decodeDruid((await params).druid);
  if (druid === null) notFound();
  const { db } = getDb();
  const [found, maxNum] = await Promise.all([getSwapByDruid(db, druid), getMaxBlockNum(db)]);
  if (!found) notFound();
  const { swap, halves } = found;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow="Swap" title={truncateHash(druid, 12, 6)} />
        <div className="-mt-4 flex flex-wrap items-center gap-2 break-all font-mono text-sm text-text">
          {druid} <CopyButton value={druid} /> <Pill tone="swap">swap</Pill>
          {!swap.complete && <Pill tone="item">incomplete</Pill>}
        </div>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetaItem label="Settled in block">
            <Link href={`/block/${swap.blockHash}`} className="text-link hover:text-link-hover">{`#${swap.blockNum.toLocaleString()}`}</Link>
          </MetaItem>
          <MetaItem label="Timestamp">{absoluteTime(swap.timestamp)} <span className="text-text-subtle">({relativeTime(swap.timestamp)})</span></MetaItem>
          <MetaItem label="Confirmations">{confirmations(maxNum, swap.blockNum).toLocaleString()}</MetaItem>
          <MetaItem label="Participants">{`${swap.txHashes.length} / ${swap.participants}`}</MetaItem>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 font-display text-lg text-text">Legs</h2>
        <SwapSummary swap={swap} />
      </section>

      <section className="space-y-6">
        <h2 className="font-display text-lg text-text">Transactions <span className="font-mono text-xs text-text-subtle">· {halves.length}</span></h2>
        {halves.map((half) => (
          <div key={half.hash}>
            <div className="mb-3 font-mono text-sm">
              <Link href={`/transaction/${half.hash}`} className="text-link hover:text-link-hover">{half.hash}</Link>
            </div>
            <InputsOutputs tx={half} coinbase={false} />
          </div>
        ))}
      </section>
    </div>
  );
}
