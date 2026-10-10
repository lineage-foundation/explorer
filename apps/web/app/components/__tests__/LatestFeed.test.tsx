import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { LatestFeed } from "../LatestFeed.js";

const snap = {
  blocks: [
    { version: 1, num: 5, hash: "b5", previousHash: "b4", timestamp: new Date(), nbTx: 2, reward: "72072000", miner: "addrA" },
  ],
  txs: [
    { kind: "tx" as const, hash: "tx_abcdef0123", blockHash: "b5", blockNum: 5, version: 1, timestamp: new Date(), txType: "token", value: "72072000", druid: null },
  ],
  blocksCount: 6,
  txCount: 1,
  circulatingSupply: "0",
  totalSupply: null,
};

describe("LatestFeed", () => {
  it("links each feed to its full, paginated list", () => {
    render(<LatestFeed initial={snap} />);
    const hrefs = screen
      .getAllByRole("link", { name: /view all/i })
      .map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/blocks");
    expect(hrefs).toContain("/transactions");
  });

  it("renders a swap in the feed as a link to its swap page", () => {
    const withSwap = {
      ...snap,
      txs: [{
        kind: "swap" as const, druid: "DRUID0xs1", participants: 2, complete: true, blockNum: 5, blockHash: "b5",
        timestamp: new Date(), txHashes: ["hA", "hB"],
        legs: [{
          from: ["B"], to: "A", txHash: "hB", met: true,
          asset: { kind: "token" as const, amount: "72072000", genesisHash: null, metadata: null },
        }],
      }],
    };
    render(<LatestFeed initial={withSwap} />);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toContain("/swap/DRUID0xs1");
  });

  it("renders the latest block and transaction rows as links", () => {
    render(<LatestFeed initial={snap} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/block/5");
    expect(hrefs).toContain("/transaction/tx_abcdef0123");
  });
});
