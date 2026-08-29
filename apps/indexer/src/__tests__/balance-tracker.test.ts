import { describe, it, expect } from "vitest";
import { BalanceTracker } from "../balance-tracker.js";

describe("BalanceTracker", () => {
  it("accumulates gains/spends per address and lists touched addresses", () => {
    const t = new BalanceTracker();
    t.addGain("A", 1); t.addGain("A", 2); t.addSpend("B", 9);
    expect(t.touched().sort()).toEqual(["A", "B"]);
    expect(t.delta("A")).toEqual({ gains: [1, 2], spends: [] });
  });

  it("merges final set = previous - spends + gains, deduped", () => {
    const t = new BalanceTracker();
    t.addSpend("A", 5); t.addGain("A", 7);
    expect(t.mergeFinal([5, 6], "A").sort((a, b) => a - b)).toEqual([6, 7]);
  });
});
