import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBlockByHashOrNumber, getBlockTransactions, getBlockCoinbaseInfo, getMaxBlockNum } from "@explorer/db";
import {
  Card, Table, THead, TBody, TR, TH, TD, Mono, Pill, CopyButton, EmptyState,
} from "@explorer/ui";
import { getDb } from "../../../lib/db.js";
import { PageHeader } from "../../components/PageHeader.js";
import {
  absoluteTime, relativeTime, truncateHash, txTypeLabel, formatLngx,
} from "../../../lib/format.js";

export const revalidate = 3600;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-text">{children}</div>
    </div>
  );
}

export default async function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = getDb();
  const block = await getBlockByHashOrNumber(db, id);
  if (!block) notFound();
  const [txsRes, coinbase, maxNum] = await Promise.all([
    getBlockTransactions(db, id),
    getBlockCoinbaseInfo(db, block.hash),
    getMaxBlockNum(db),
  ]);
  const txs = txsRes?.transactions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Block" title={`#${block.num.toLocaleString()}`} />
      <div className="flex items-center justify-between text-sm">
        {block.num > 0
          ? (
            <Link
              href={`/block/${block.num - 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
            >
              {`← Block #${(block.num - 1).toLocaleString()}`}
            </Link>
          )
          : <span />}
        {maxNum !== null && block.num < maxNum
          ? (
            <Link
              href={`/block/${block.num + 1}`}
              className="rounded-md border border-border px-3 py-1.5 text-text-muted hover:text-text"
            >
              {`Block #${(block.num + 1).toLocaleString()} →`}
            </Link>
          )
          : <span />}
      </div>
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hash">{block.hash} <CopyButton value={block.hash} /></Field>
          <Field label="Previous hash">
            {block.previousHash
              ? (
                <Link href={`/block/${block.previousHash}`} className="text-link hover:text-link-hover">
                  {truncateHash(block.previousHash, 10, 8)}
                </Link>
              )
              : "—"}
          </Field>
          <Field label="Timestamp">
            {absoluteTime(block.timestamp)} <span className="text-text-subtle">({relativeTime(block.timestamp)})</span>
          </Field>
          <Field label="Merkle root">{block.merkleRootHash ?? "—"}</Field>
          <Field label="Version">{block.version}</Field>
          <Field label="Bits">{block.bits !== null ? block.bits.toString() : "—"}</Field>
          <Field label="Transactions">{block.nbTx ?? 0}</Field>
          <Field label="Reward">{coinbase.reward === null ? "—" : `${formatLngx(coinbase.reward, 2)} LNGX`}</Field>
          <Field label="Miner">
            {coinbase.miner
              ? (
                <Link href={`/address/${coinbase.miner}`} className="text-link hover:text-link-hover">
                  {truncateHash(coinbase.miner, 10, 8)}
                </Link>
              )
              : "—"}
          </Field>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 font-display text-lg text-text">Transactions</h2>
        {txs.length === 0
          ? <EmptyState title="No transactions in this block" />
          : (
            <Table>
              <THead><TR><TH>Transaction</TH><TH>Type</TH></TR></THead>
              <TBody>
                {txs.map((t) => {
                  const label = txTypeLabel(t.txType, t.coinbase);
                  return (
                    <TR key={t.hash}>
                      <TD>
                        <Link href={`/transaction/${t.hash}`} className="text-link hover:text-link-hover">
                          <Mono>{truncateHash(t.hash)}</Mono>
                        </Link>
                      </TD>
                      <TD><Pill tone={label === "unknown" ? "neutral" : label}>{label}</Pill></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
      </section>
    </div>
  );
}
