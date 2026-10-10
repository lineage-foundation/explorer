import { describe, it, expect } from "vitest";
import type { SwapLeg } from "@explorer/db";
import { formatLngx } from "../format.js";
import { formatAsset, groupBySwap, legsForAddress, summarise, swapHref } from "../swap.js";

const itemLeg: SwapLeg = {
  from: ["A"], to: "B", txHash: "hA", met: true,
  asset: { kind: "item", amount: "1", genesisHash: "gen1", metadata: null },
};
const tokenLeg: SwapLeg = {
  from: ["B"], to: "A", txHash: "hB", met: true,
  asset: { kind: "token", amount: "1000", genesisHash: null, metadata: null },
};

describe("formatAsset", () => {
  it("counts items without a token unit", () => {
    expect(formatAsset(itemLeg.asset)).toBe("1 item");
    expect(formatAsset({ ...itemLeg.asset, amount: "3" })).toBe("3 items");
    expect(formatAsset({ ...itemLeg.asset, amount: "1234" })).toBe("1,234 items");
  });
  it("formats tokens as LNGX", () => {
    expect(formatAsset({ kind: "token", amount: "72072000", genesisHash: null, metadata: null })).toBe("1 LNGX");
    expect(formatAsset(tokenLeg.asset)).toBe(`${formatLngx("1000")} LNGX`);
  });
});

describe("summarise", () => {
  it("joins the legs' assets", () => {
    expect(summarise({ legs: [itemLeg, tokenLeg] })).toBe(`1 item ⇄ ${formatLngx("1000")} LNGX`);
  });
  it("renders a dash when there are no legs", () => {
    expect(summarise({ legs: [] })).toBe("—");
  });
});

describe("legsForAddress", () => {
  it("splits legs into what the address gave and received", () => {
    expect(legsForAddress({ legs: [itemLeg, tokenLeg] }, "A")).toEqual({ gave: [itemLeg], received: [tokenLeg] });
    expect(legsForAddress({ legs: [itemLeg, tokenLeg] }, "B")).toEqual({ gave: [tokenLeg], received: [itemLeg] });
  });
  it("ignores legs with an unknown sender and addresses outside the swap", () => {
    const unmet: SwapLeg = { ...tokenLeg, from: null, txHash: null, met: false };
    expect(legsForAddress({ legs: [unmet] }, "B")).toEqual({ gave: [], received: [] });
    expect(legsForAddress({ legs: [itemLeg, tokenLeg] }, "Z")).toEqual({ gave: [], received: [] });
  });
});

describe("swapHref", () => {
  it("URL-encodes the druid", () => {
    expect(swapHref("DRUID0xab")).toBe("/swap/DRUID0xab");
    expect(swapHref("odd druid/1")).toBe("/swap/odd%20druid%2F1");
  });
});

describe("groupBySwap", () => {
  const row = (hash: string, druid: string | null) => ({ hash, druid });
  it("collapses rows sharing a druid at the position of the first, keeping the rest in order", () => {
    const rows = [row("cb", null), row("sA", "D1"), row("mid", null), row("sB", "D1"), row("x", "D2")];
    expect(groupBySwap(rows)).toEqual([
      { kind: "tx", row: rows[0] },
      { kind: "swap", druid: "D1", rows: [rows[1], rows[3]] },
      { kind: "tx", row: rows[2] },
      { kind: "swap", druid: "D2", rows: [rows[4]] },
    ]);
  });
  it("returns an empty list for no rows", () => {
    expect(groupBySwap([])).toEqual([]);
  });
});
