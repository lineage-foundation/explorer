import { describe, it, expect } from "vitest";
import { ListQuery } from "../src/schemas.js";
import { classifyTxType } from "../src/helpers.js";

describe("ListQuery", () => {
  it("coerces strings and applies defaults", () => {
    expect(ListQuery.parse({})).toEqual({ limit: 25, offset: 0, order: "desc" });
    expect(ListQuery.parse({ limit: "5", offset: "10", order: "asc" })).toEqual({
      limit: 5, offset: 10, order: "asc",
    });
  });
  it("rejects out-of-range and invalid values", () => {
    expect(ListQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(ListQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(ListQuery.safeParse({ order: "sideways" }).success).toBe(false);
  });
});

describe("classifyTxType", () => {
  it("classifies by coinbase then value type", () => {
    expect(classifyTxType("token", true)).toBe("coinbase");
    expect(classifyTxType("token", false)).toBe("token");
    expect(classifyTxType("item", false)).toBe("item");
    expect(classifyTxType(undefined, false)).toBe("unknown");
  });
});
