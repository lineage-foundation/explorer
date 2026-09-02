import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { sumAmounts } from "../InputsOutputs.js";

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
