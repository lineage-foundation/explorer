import { describe, it, expect } from "vitest";
import { formatLngx, formatLngxPlain } from "../src/index.js";

describe("formatLngx", () => {
  it("divides a raw amount by the coin fraction", () => {
    expect(formatLngx("72072000")).toBe("1");
    expect(formatLngx("144144000")).toBe("2");
  });
  it("returns 0 for null", () => {
    expect(formatLngx(null)).toBe("0");
  });
});

describe("formatLngxPlain", () => {
  it("returns a plain ungrouped decimal", () => {
    expect(formatLngxPlain("72072000")).toBe("1");
    expect(formatLngxPlain("36036000")).toBe("0.5");
    expect(formatLngxPlain("720720000000")).toBe("10000");
    expect(formatLngxPlain("720720000000")).not.toContain(",");
    expect(formatLngxPlain(null)).toBe("0");
  });
});
