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
  it("returns unknown for junk", () => {
    expect(classify("???")).toEqual({ kind: "unknown", href: null });
  });
});
