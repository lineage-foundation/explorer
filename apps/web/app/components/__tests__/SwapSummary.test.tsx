import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SwapLeg } from "@explorer/db";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { SwapSummary } from "../SwapSummary.js";

const itemLeg: SwapLeg = {
  from: ["addrA"], to: "addrB", txHash: "hA", met: true,
  asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null },
};
const tokenLeg: SwapLeg = {
  from: ["addrB", "addrB2"], to: "addrA", txHash: "hB", met: true,
  asset: { kind: "token", amount: "72072000", genesisHash: null, metadata: null },
};

describe("SwapSummary", () => {
  it("shows who gave what to whom, with links", () => {
    render(<SwapSummary swap={{ legs: [itemLeg, tokenLeg] }} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([
      "/address/addrA", "/address/addrB", "/item/gen1",
    ]));
    expect(screen.getByText("1 LNGX")).toBeInTheDocument();
    expect(screen.getByText("× 1")).toBeInTheDocument();
    expect(screen.getAllByText("met")).toHaveLength(2);
  });

  it("notes extra addresses in a party", () => {
    render(<SwapSummary swap={{ legs: [tokenLeg] }} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("prints unknown for a missing or empty sender and marks an unmet leg", () => {
    render(<SwapSummary swap={{ legs: [
      { ...itemLeg, from: null, txHash: null, met: false },
      { ...tokenLeg, from: [] },
    ] }} />);
    expect(screen.getAllByText("unknown")).toHaveLength(2);
    expect(screen.getByText("not met")).toBeInTheDocument();
  });

  it("renders an empty state when there are no legs", () => {
    render(<SwapSummary swap={{ legs: [] }} />);
    expect(screen.getByText("No legs could be derived for this trade.")).toBeInTheDocument();
  });
});
