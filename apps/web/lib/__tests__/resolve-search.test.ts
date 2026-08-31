import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@explorer/db", () => ({
  getBlockHashByNum: vi.fn(),
  searchByPrefix: vi.fn(),
}));

import { getBlockHashByNum, searchByPrefix } from "@explorer/db";
import { resolveSearch } from "../resolve-search.js";

const db = {} as never;
beforeEach(() => vi.clearAllMocks());

describe("resolveSearch", () => {
  it("resolves a numeric query to a block number", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue("H5");
    const [s] = await resolveSearch(db, "5");
    expect(s).toMatchObject({ kind: "block", label: "Block #5", href: "/block/5", found: true });
    expect(searchByPrefix).not.toHaveBeenCalled();
  });

  it("marks a missing block number as not found", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue(null);
    const [s] = await resolveSearch(db, "999");
    expect(s).toMatchObject({ found: false, sublabel: "not found" });
  });

  it("prefix-matches blocks, transactions, and addresses", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({
      blocks: [{ num: 10, hash: "b00cabc" }],
      transactions: [{ hash: "g1cdabc" }],
      addresses: [{ address: "e9ebabc" }],
    });
    const res = await resolveSearch(db, "abcd");
    expect(res.map((s) => s.kind)).toEqual(["block", "tx", "address"]);
    expect(res[0]).toMatchObject({ href: "/block/b00cabc", found: true });
    expect(res[1]).toMatchObject({ href: "/transaction/g1cdabc", found: true });
    expect(res[2]).toMatchObject({ href: "/address/e9ebabc", found: true });
  });

  it("does not query for a too-short prefix", async () => {
    expect(await resolveSearch(db, "b0")).toEqual([]);
    expect(searchByPrefix).not.toHaveBeenCalled();
  });

  it("caps results at the limit", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({
      blocks: Array.from({ length: 10 }, (_, i) => ({ num: i, hash: `b${i}` })),
      transactions: [],
      addresses: [],
    });
    const res = await resolveSearch(db, "b000");
    expect(res.length).toBe(8);
  });

  it("offers any complete 64-hex address as a fallback with no prefix match", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({ blocks: [], transactions: [], addresses: [] });
    const addr = "a".repeat(64);
    const [s] = await resolveSearch(db, addr);
    expect(s).toMatchObject({ kind: "address", href: `/address/${addr}`, found: true });
  });
});
