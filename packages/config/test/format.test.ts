import { describe, it, expect } from "vitest";
import { formatLngx } from "../src/index.js";

describe("formatLngx", () => {
  it("divides a raw amount by the coin fraction", () => {
    expect(formatLngx("72072000")).toBe("1");
    expect(formatLngx("144144000")).toBe("2");
  });
  it("returns 0 for null", () => {
    expect(formatLngx(null)).toBe("0");
  });
});
