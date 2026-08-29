import Link from "next/link";
import type { TxDetail } from "@explorer/db";
import { Mono, Tag } from "@explorer/ui";
import { formatLngx, truncateHash } from "../../lib/format.js";
import { TOKEN_TICKER } from "@explorer/config";

function sumAmounts(values: (string | null)[]): string {
  const total = values.reduce((acc, v) => acc + (v ? BigInt(v) : 0n), 0n);
  return formatLngx(total.toString());
}

export function InputsOutputs({ tx, coinbase }: { tx: TxDetail; coinbase: boolean }) {
  const inTotal = sumAmounts(tx.ins.map((i) => i.amount));
  const outTotal = sumAmounts(tx.outs.filter((o) => o.valueType === "token").map((o) => o.amount));
  const inputAddrs = new Set(tx.ins.map((i) => i.fromAddress).filter(Boolean));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3 rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-sm">
        {coinbase
          ? <span className="text-accent">newly minted → {outTotal} {TOKEN_TICKER}</span>
          : <><span>{inTotal} {TOKEN_TICKER} in</span><span className="text-accent">→</span><span>{outTotal} {TOKEN_TICKER} out</span></>}
      </div>

      <h3 className="mb-2 font-display text-sm text-text">Inputs <span className="font-mono text-xs text-text-subtle">· {coinbase ? "coinbase" : tx.ins.length}</span></h3>
      <div className="rounded-md border border-border bg-surface p-2">
        {coinbase || tx.ins.length === 0
          ? <div className="px-2 py-1.5 text-sm text-text-subtle">No inputs (coinbase / newly minted)</div>
          : tx.ins.map((i, idx) => (
            <div key={idx} className="mb-1.5 flex justify-between gap-3 rounded bg-bg-raised px-2 py-2 last:mb-0">
              <div>
                {i.fromAddress
                  ? <Link href={`/address/${i.fromAddress}`} className="font-mono text-xs text-link hover:text-link-hover">{truncateHash(i.fromAddress, 8, 6)}</Link>
                  : <span className="font-mono text-xs text-text-subtle">unresolved</span>}
                <div className="mt-0.5 font-mono text-[0.6rem] text-text-subtle">
                  {i.previousOutTxHash ? `spends ${truncateHash(i.previousOutTxHash, 6, 4)} : ${i.previousOutTxN ?? "?"}` : "coinbase"}
                </div>
              </div>
              <Mono className="text-xs">{i.amount ? `${formatLngx(i.amount)} ${TOKEN_TICKER}` : "—"}</Mono>
            </div>
          ))}
      </div>

      <div className="my-2 flex flex-col items-center text-accent">
        <span className="h-3 w-0.5 aurora-rail" />
        <span className="my-0.5 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-text-subtle">↓ flows to</span>
        <span className="h-3 w-0.5 aurora-rail" />
      </div>

      <h3 className="mb-2 font-display text-sm text-text">Outputs <span className="font-mono text-xs text-text-subtle">· {tx.outs.length}</span></h3>
      <div className="rounded-md border border-border bg-surface p-2">
        {tx.outs.map((o) => (
          <div key={o.n} className="mb-1.5 flex justify-between gap-3 rounded bg-bg-raised px-2 py-2 last:mb-0">
            <div>
              {o.scriptPublicKey
                ? <Link href={`/address/${o.scriptPublicKey}`} className="font-mono text-xs text-link hover:text-link-hover">{truncateHash(o.scriptPublicKey, 8, 6)}</Link>
                : <span className="font-mono text-xs text-text-subtle">—</span>}
              <div className="mt-0.5 font-mono text-[0.6rem] text-text-subtle">
                index {o.n}
                {o.valueType === "item" && o.genesisHash ? ` · genesis ${truncateHash(o.genesisHash, 6, 4)}` : ""}
                {o.valueType === "token" && o.scriptPublicKey && inputAddrs.has(o.scriptPublicKey) ? " · change" : ""}
              </div>
            </div>
            {o.valueType === "item"
              ? <Tag>item</Tag>
              : <Mono className="text-xs">{formatLngx(o.amount)} {TOKEN_TICKER}</Mono>}
          </div>
        ))}
      </div>
    </div>
  );
}
