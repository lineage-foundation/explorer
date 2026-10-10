import { describe, it, expect } from "vitest";
import { classify } from "../search.js";

describe("classify", () => {
  it("routes a numeric input to a block by number", () => {
    expect(classify("128940")).toEqual({ kind: "block-num", href: "/block/128940" });
  });
  it("routes a b-prefixed 65-char hex to a block hash", () => {
    const h = "b" + "a".repeat(64);
    expect(classify(h)).toEqual({ kind: "block-hash", href: `/block/${h}` });
  });
  it("routes a g-prefixed 32-char hex to a transaction", () => {
    const h = "g" + "a".repeat(31);
    expect(classify(h)).toEqual({ kind: "tx", href: `/transaction/${h}` });
  });
  it("routes a 64-char hex to an address", () => {
    const h = "a".repeat(64);
    expect(classify(h)).toEqual({ kind: "address", href: `/address/${h}` });
  });
  it("routes a canonical DRUID to its swap", () => {
    const d = "DRUID0x277251e1651aa2861727323acf69a358";
    expect(classify(d)).toEqual({ kind: "swap", href: `/swap/${d}` });
    expect(classify(`  ${d}  `)).toEqual({ kind: "swap", href: `/swap/${d}` });
  });
  it("does not treat a malformed DRUID as a swap", () => {
    expect(classify("DRUID0x123").kind).toBe("unknown");
    expect(classify("DRUID0x" + "z".repeat(32)).kind).toBe("unknown");
  });
  it("returns unknown for junk", () => {
    expect(classify("???")).toEqual({ kind: "unknown", href: null });
  });
});
