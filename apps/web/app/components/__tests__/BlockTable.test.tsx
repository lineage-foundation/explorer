import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { BlockTable } from "../BlockTable.js";

const base = { version: 1, previousHash: null, timestamp: new Date(), nbTx: 1, reward: "72072000" };

describe("BlockTable", () => {
  it("renders the miner as a link to the address", () => {
    render(<BlockTable blocks={[{ ...base, num: 5, hash: "b5", miner: "addrA" }]} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/address/addrA");
  });

  it("shows an em dash when the miner is unknown", () => {
    render(<BlockTable blocks={[{ ...base, num: 6, hash: "b6", miner: null }]} />);
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/address/null");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
