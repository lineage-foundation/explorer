import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { parsePage } from "../Pagination.js";

describe("parsePage", () => {
  it("defaults to 1 for missing, non-numeric, or below-range input", () => {
    expect(parsePage({})).toBe(1);
    expect(parsePage({ page: "abc" })).toBe(1);
    expect(parsePage({ page: "0" })).toBe(1);
    expect(parsePage({ page: "-5" })).toBe(1);
  });
  it("parses a valid page and uses the first value of an array", () => {
    expect(parsePage({ page: "7" })).toBe(7);
    expect(parsePage({ page: ["3", "9"] })).toBe(3);
  });
  it("clamps an absurdly large page to the max, bounding SQL offset", () => {
    expect(parsePage({ page: "999999999" })).toBe(4000);
  });
});
