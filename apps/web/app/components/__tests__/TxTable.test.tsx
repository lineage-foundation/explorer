import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import type { ActivityItem, SwapLeg } from "@explorer/db";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { TxTable } from "../TxTable.js";

const itemLeg: SwapLeg = {
  from: ["A"], to: "B", txHash: "hA", met: true,
  asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null },
};
const tokenLeg: SwapLeg = {
  from: ["B"], to: "A", txHash: "hB", met: true,
  asset: { kind: "token", amount: "72072000", genesisHash: null, metadata: null },
};
const swap = (druid: string, legs: SwapLeg[]): ActivityItem => ({
  kind: "swap", druid, participants: 2, complete: legs.length > 0, blockNum: 2, blockHash: "b2",
  timestamp: new Date(), legs, txHashes: ["hA", "hB"],
});
const plain: ActivityItem = {
  kind: "tx", hash: "t1", blockHash: "b1", blockNum: 1, version: 1, timestamp: new Date(),
  txType: "token", value: "72072000", druid: null,
};

describe("TxTable", () => {
  it("renders a swap as one row linking to the swap page, beside ordinary rows", () => {
    render(<TxTable txs={[swap("DRUID0xs1", [itemLeg, tokenLeg]), plain]} />);
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(2);
    const swapRow = within(rows[0]!);
    expect(swapRow.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/trade/DRUID0xs1", "/block/2"]);
    expect(swapRow.getByText("1 item ⇄ 1 LNGX")).toBeInTheDocument();
    expect(swapRow.getByText("trade")).toBeInTheDocument();
    const plainRow = within(rows[1]!);
    expect(plainRow.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/transaction/t1", "/block/1"]);
    expect(plainRow.getByText("token")).toBeInTheDocument();
  });

  it("URL-encodes a non-canonical druid in the link", () => {
    render(<TxTable txs={[swap("odd druid/1", [tokenLeg])]} />);
    expect(screen.getAllByRole("link")[0]?.getAttribute("href")).toBe("/trade/odd%20druid%2F1");
  });

  it("renders a swap with no legs without throwing", () => {
    render(<TxTable txs={[swap("DRUID0xs2", [])]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
