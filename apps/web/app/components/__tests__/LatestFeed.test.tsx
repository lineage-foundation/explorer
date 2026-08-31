import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { LatestFeed } from "../LatestFeed.js";

const snap = {
  blocks: [
    { version: 1, num: 5, hash: "b5", previousHash: "b4", timestamp: new Date(), nbTx: 2, reward: "72072000" },
  ],
  txs: [
    { hash: "tx_abcdef0123", blockHash: "b5", blockNum: 5, version: 1, timestamp: new Date(), txType: "token", value: "72072000" },
  ],
  blocksCount: 6,
  txCount: 1,
  circulatingSupply: "0",
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

  it("renders the latest block and transaction rows as links", () => {
    render(<LatestFeed initial={snap} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/block/5");
    expect(hrefs).toContain("/transaction/tx_abcdef0123");
  });
});
