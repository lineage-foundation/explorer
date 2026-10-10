import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@explorer/db", () => ({
  getBlockHashByNum: vi.fn(),
  searchByPrefix: vi.fn(),
  getSwapByDruid: vi.fn(),
  getItem: vi.fn(),
}));

import { getBlockHashByNum, searchByPrefix, getSwapByDruid, getItem } from "@explorer/db";
import { resolveSearch } from "../resolve-search.js";

const db = {} as never;
beforeEach(() => vi.clearAllMocks());

describe("resolveSearch", () => {
  const TX = `g${"a".repeat(31)}`;

  it("offers the item as well when a full transaction hash is a create transaction", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({ blocks: [], transactions: [{ hash: TX }], addresses: [] });
    vi.mocked(getItem).mockResolvedValue({ genesisHash: TX } as never);
    const res = await resolveSearch(db, TX);
    expect(res.map((s) => [s.kind, s.href])).toEqual([["tx", `/transaction/${TX}`], ["item", `/item/${TX}`]]);
    expect(res[1]).toMatchObject({ label: "Item gaaaaa…aaaa", found: true });
  });

  it("offers no item for a transaction hash that is not a create transaction", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({ blocks: [], transactions: [{ hash: TX }], addresses: [] });
    vi.mocked(getItem).mockResolvedValue(null);
    expect((await resolveSearch(db, TX)).map((s) => s.kind)).toEqual(["tx"]);
  });

  it("does not look for an item until the hash is complete", async () => {
    vi.mocked(searchByPrefix).mockResolvedValue({ blocks: [], transactions: [], addresses: [] });
    await resolveSearch(db, "gaaaa");
    expect(getItem).not.toHaveBeenCalled();
  });

  const DRUID = "DRUID0x277251e1651aa2861727323acf69a358";

  it("resolves an exact DRUID to its swap without a prefix search", async () => {
    vi.mocked(getSwapByDruid).mockResolvedValue({ swap: {}, halves: [] } as never);
    const res = await resolveSearch(db, DRUID);
    expect(res).toEqual([{ kind: "swap", label: "Swap DRUID0x2772…a358", href: `/swap/${DRUID}`, found: true }]);
    expect(getSwapByDruid).toHaveBeenCalledWith(db, DRUID);
    expect(searchByPrefix).not.toHaveBeenCalled();
  });

  it("marks an unknown DRUID as not found", async () => {
    vi.mocked(getSwapByDruid).mockResolvedValue(null);
    const [s] = await resolveSearch(db, DRUID);
    expect(s).toMatchObject({ kind: "swap", found: false, sublabel: "not found" });
  });

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
