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
  it("rounds to a fixed number of decimals when requested", () => {
    // 108108000 / 72072000 = 1.5 -> 2dp "1.50"
    expect(formatLngx("108108000", 2)).toBe("1.50");
    // long fractional value rounded to 2dp
    expect(formatLngx("100000000", 2)).toBe("1.39");
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
