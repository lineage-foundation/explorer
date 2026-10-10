import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { render, screen } from "@testing-library/react";
import { Pagination, parsePage } from "../Pagination.js";

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

describe("parsePage with a named parameter", () => {
  it("reads the page from another query parameter", () => {
    expect(parsePage({ holders: "4", page: "9" }, "holders")).toBe(4);
    expect(parsePage({ page: "9" }, "holders")).toBe(1);
  });
});

describe("Pagination", () => {
  const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

  it("links to the previous and next page", () => {
    render(<Pagination page={2} hasMore basePath="/blocks" />);
    expect(hrefs()).toEqual(["/blocks?page=1", "/blocks?page=3"]);
  });

  it("uses a custom parameter and keeps the other query values", () => {
    render(<Pagination page={2} hasMore basePath="/item/g1" param="holders" query={{ page: "5", q: "a b&c" }} />);
    expect(hrefs()).toEqual([
      "/item/g1?page=5&q=a+b%26c&holders=1",
      "/item/g1?page=5&q=a+b%26c&holders=3",
    ]);
  });

  it("drops empty query values and never duplicates its own parameter", () => {
    render(<Pagination page={1} hasMore basePath="/items" query={{ q: "", page: "7" }} />);
    expect(hrefs()).toEqual(["/items?page=2"]);
  });
});
