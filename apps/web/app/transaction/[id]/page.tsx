import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "../../../lib/db.js";
import { getTransactionByHash, getBlockByHashOrNumber, getMaxBlockNum } from "@explorer/db";
import { PageHeader } from "../../components/PageHeader.js";
import { InputsOutputs } from "../../components/InputsOutputs.js";
import { Card, Pill, CopyButton } from "@explorer/ui";
import {
  absoluteTime, relativeTime, truncateHash, txTypeLabel, confirmations,
} from "../../../lib/format.js";

export const revalidate = 3600;

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{label}</div>
      <div className="mt-1 font-mono text-xs text-text">{children}</div>
    </div>
  );
}

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = getDb();
  const tx = await getTransactionByHash(db, id);
  if (!tx) notFound();
  const block = await getBlockByHashOrNumber(db, tx.blockHash);
  const maxNum = await getMaxBlockNum(db);
  const coinbase = block?.nonceAndMiningTxHash && Array.isArray(block.nonceAndMiningTxHash)
    ? block.nonceAndMiningTxHash[1] === tx.hash
    : false;
  const firstOut = tx.outs[0]?.valueType;
  const label = txTypeLabel(firstOut, coinbase);

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow="Transaction" title={truncateHash(tx.hash, 10, 8)} />
        <div className="-mt-4 flex flex-wrap items-center gap-2 break-all font-mono text-sm text-text">
          <CopyButton value={tx.hash} /> <Pill tone={label === "unknown" ? "neutral" : label}>{label}</Pill>
        </div>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetaItem label="Block"><Link href={`/block/${tx.blockHash}`} className="text-link hover:text-link-hover">{block ? `#${block.num.toLocaleString()}` : "—"}</Link></MetaItem>
          <MetaItem label="Timestamp">{absoluteTime(tx.timestamp)} <span className="text-text-subtle">({relativeTime(tx.timestamp)})</span></MetaItem>
          <MetaItem label="Version">{tx.version}</MetaItem>
          <MetaItem label="Confirmations">{block ? confirmations(maxNum, block.num).toLocaleString() : "—"}</MetaItem>
        </div>
      </Card>
      <InputsOutputs tx={tx} coinbase={coinbase} />
    </div>
  );
}
