"use client";

import { useEffect, useState } from "react";
import type { BlockListItem, TxListItem } from "@explorer/db";
import { StatRow } from "./StatRow.js";
import { BlockTable } from "./BlockTable.js";
import { TxTable } from "./TxTable.js";

interface Snapshot {
  blocks: BlockListItem[];
  txs: TxListItem[];
  blocksCount: number;
  txCount: number;
  circulatingSupply: string;
}

function reviveDates<T extends { timestamp: Date | null }>(
  rows: (Omit<T, "timestamp"> & { timestamp: string | null })[],
): T[] {
  return rows.map((r) => ({ ...r, timestamp: r.timestamp ? new Date(r.timestamp) : null })) as T[];
}

export function LatestFeed({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState(initial);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch("/api/latest", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
        if (alive) {
          setSnap({
            ...data,
            blocks: reviveDates<BlockListItem>(data.blocks as never),
            txs: reviveDates<TxListItem>(data.txs as never),
          });
        }
      } catch {
        /* keep last snapshot */
      }
    };
    const id = setInterval(() => void tick(), 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6">
      <StatRow blocksCount={snap.blocksCount} txCount={snap.txCount} circulatingSupply={snap.circulatingSupply} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-display text-lg text-text">Latest blocks</h2>
          <BlockTable blocks={snap.blocks} />
        </section>
        <section>
          <h2 className="mb-2 font-display text-lg text-text">Latest transactions</h2>
          <TxTable txs={snap.txs} />
        </section>
      </div>
    </div>
  );
}
