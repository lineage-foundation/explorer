import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TxDetail } from "@explorer/db";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { InputsOutputs, sumAmounts } from "../InputsOutputs.js";
import { SwapBanner } from "../SwapBanner.js";

const raw = (lngx: bigint) => (lngx * 72072000n).toString();

describe("sumAmounts", () => {
  it("sums raw amounts with BigInt and formats the LNGX total", () => {
    expect(sumAmounts([raw(500n), raw(300n)])).toBe("800");
  });
  it("treats null entries as zero", () => {
    expect(sumAmounts([null, raw(1n), null])).toBe("1");
  });
  it("keeps precision for a sum beyond 2^53", () => {
    const big = raw(1_250_000_000n); // 1.25B LNGX, ~9e16 raw units (> 2^53)
    expect(sumAmounts([big, big])).toBe("2,500,000,000");
  });
});

function detail(
  ins: { from: string; amount: string; kind?: "token" | "item"; genesis?: string }[],
  outs: { to: string; amount: string; kind?: "token" | "item"; genesis?: string }[],
): TxDetail {
  return {
    blockHash: "b", hash: "h", version: 2, timestamp: null, coinbase: false, fees: null, druidInfo: null, druid: null,
    ins: ins.map((i, n) => ({
      scriptSignature: {}, previousOutTxHash: "prev", previousOutTxN: n, fromAddress: i.from, amount: i.amount,
      valueType: i.kind ?? "token", genesisHash: i.genesis ?? null,
    })),
    outs: outs.map((o, n) => ({
      valueType: o.kind ?? "token", amount: o.amount, locktime: "0", genesisHash: o.genesis ?? null,
      scriptPublicKey: o.to, itemMetadata: null, n,
      itemGenesis: o.kind === "item" ? (o.genesis ?? "h") : null,
    })),
  };
}

describe("InputsOutputs", () => {
  it("shows an item input as an item, never as LNGX", () => {
    const { container } = render(
      <InputsOutputs
        coinbase={false}
        tx={detail(
          [{ from: "addrA", amount: "1", kind: "item", genesis: "gen1" }],
          [{ to: "addrB", amount: "1", kind: "item", genesis: "gen1" }],
        )}
      />,
    );
    expect(container.textContent).not.toMatch(/0\.0+1 LNGX/);
    expect(container.textContent).toContain("0 LNGX in");
    expect(container.textContent).toContain("0 LNGX out");
    expect(container.textContent).toContain("· 1 item");
    expect(screen.getAllByText("× 1")).toHaveLength(2);
    // Both the spent item and the item output link to the item's own page.
    const itemLinks = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/item/gen1");
    expect(itemLinks).toHaveLength(2);
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/transaction/gen1")).toBe(false);
  });

  it("pluralises the item count from the outputs", () => {
    const { container } = render(
      <InputsOutputs
        coinbase={false}
        tx={detail(
          [{ from: "addrA", amount: "3", kind: "item", genesis: "gen1" }],
          [{ to: "addrB", amount: "2", kind: "item", genesis: "gen1" }, { to: "addrA", amount: "1", kind: "item", genesis: "gen1" }],
        )}
      />,
    );
    expect(container.textContent).toContain("· 3 items");
  });

  it("leaves a token-only transaction unchanged", () => {
    const { container } = render(
      <InputsOutputs
        coinbase={false}
        tx={detail([{ from: "addrA", amount: raw(5n) }], [{ to: "addrB", amount: raw(2n) }, { to: "addrA", amount: raw(3n) }])}
      />,
    );
    expect(container.textContent).toContain("5 LNGX in");
    expect(container.textContent).toContain("5 LNGX out");
    expect(container.textContent).not.toContain("item");
    expect(container.textContent).toContain("· change");
  });
});

describe("InputsOutputs item links", () => {
  it("links a creation output to the item it creates (the transaction itself)", () => {
    const tx = detail([], [{ to: "addrA", amount: "1", kind: "item" }]);
    // A creation output has no genesis hash on chain; its item is this transaction.
    tx.outs[0]!.genesisHash = null;
    tx.outs[0]!.itemGenesis = "h";
    render(<InputsOutputs coinbase={false} tx={tx} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toContain("/item/h");
  });

  it("URL-encodes the genesis hash in item links", () => {
    render(<InputsOutputs coinbase={false} tx={detail([], [{ to: "addrA", amount: "1", kind: "item", genesis: "g 1/2" }])} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toContain("/item/g%201%2F2");
  });
});

describe("SwapBanner", () => {
  it("links to the swap and to each counterpart half", () => {
    render(<SwapBanner druid="odd druid/1" counterparts={["hB", "hC"]} />);
    expect(screen.getByText("Half of a two-way swap")).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/swap/odd%20druid%2F1", "/transaction/hB", "/transaction/hC",
    ]);
  });

  it("says so when no counterpart is indexed", () => {
    render(<SwapBanner druid="DRUID0xs1" counterparts={[]} />);
    expect(screen.getByText("none indexed")).toBeInTheDocument();
  });
});
