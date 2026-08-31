import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@explorer/db", () => ({
  getBlockHashByNum: vi.fn(),
  getBlockByHashOrNumber: vi.fn(),
  getTransactionByHash: vi.fn(),
  getAccountBalance: vi.fn(),
}));

import {
  getBlockHashByNum, getBlockByHashOrNumber, getTransactionByHash, getAccountBalance,
} from "@explorer/db";
import { resolveSearch } from "../resolve-search.js";

const db = {} as never;
beforeEach(() => vi.clearAllMocks());

describe("resolveSearch", () => {
  it("resolves an existing block number", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue("H5");
    const [s] = await resolveSearch(db, "5");
    expect(s).toMatchObject({ kind: "block", label: "Block #5", href: "/block/5", found: true });
    expect(s?.sublabel).toBeUndefined();
  });

  it("marks a missing block number as not found", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue(null);
    const [s] = await resolveSearch(db, "999");
    expect(s).toMatchObject({ kind: "block", href: "/block/999", found: false, sublabel: "not found" });
  });

  it("labels a block hash with its resolved number", async () => {
    vi.mocked(getBlockByHashOrNumber).mockResolvedValue({ num: 42 } as never);
    const hash = `b${"a".repeat(64)}`;
    const [s] = await resolveSearch(db, hash);
    expect(s).toMatchObject({ kind: "block", label: "Block #42", href: `/block/${hash}`, found: true });
  });

  it("marks a missing block hash as not found with a truncated label", async () => {
    vi.mocked(getBlockByHashOrNumber).mockResolvedValue(null);
    const hash = `b${"c".repeat(64)}`;
    const [s] = await resolveSearch(db, hash);
    expect(s).toMatchObject({ kind: "block", href: `/block/${hash}`, found: false, sublabel: "not found" });
    expect(s?.label).toContain("Block ");
  });

  it("resolves a transaction hash and its existence", async () => {
    vi.mocked(getTransactionByHash).mockResolvedValue({ hash: "g" } as never);
    const hash = `g${"a".repeat(31)}`;
    const [s] = await resolveSearch(db, hash);
    expect(s).toMatchObject({ kind: "tx", href: `/transaction/${hash}`, found: true });
  });

  it("resolves an address with its balance and is always navigable", async () => {
    vi.mocked(getAccountBalance).mockResolvedValue({ balance: (500n * 72072000n).toString() });
    const addr = "a".repeat(64);
    const [s] = await resolveSearch(db, addr);
    expect(s).toMatchObject({ kind: "address", href: `/address/${addr}`, found: true });
    expect(s?.sublabel).toBe("500.00 LNGX");
  });

  it("returns nothing for unrecognized input", async () => {
    expect(await resolveSearch(db, "???")).toEqual([]);
  });
});
