import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures, seedItemFixtures, ALPHA_META } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => {
  handle = createDb(URL);
  await seedFixtures(handle.db);
  await seedItemFixtures(handle.db);
});
afterAll(async () => { await handle.close(); });

const get = async <T>(path: string): Promise<{ status: number; body: T; type: string | null }> => {
  const res = await app().request(path);
  return { status: res.status, body: (await res.json()) as T, type: res.headers.get("content-type") };
};

describe("item detail routes", () => {
  it("returns an item with its holders and no LNGX amounts", async () => {
    const { status, body } = await get<Record<string, unknown>>("/api/v1/items/it_a");
    expect(status).toBe(200);
    expect(body).toEqual({
      genesisHash: "it_a", metadata: ALPHA_META, totalAmount: "3", creator: "A",
      blockNum: 30, blockHash: "b_items", timestamp: "2024-02-01T00:00:00.000Z", holderCount: 2,
      holders: [{ address: "B", amount: "2" }, { address: "A", amount: "1" }],
    });
  });

  it("404s a hash that is not a create transaction", async () => {
    for (const hash of ["plain", "xf_1", "tx_1", "nope"]) {
      const { status, type } = await get(`/api/v1/items/${hash}`);
      expect(status, hash).toBe(404);
      expect(type).toContain("application/problem+json");
    }
  });

  it("lists an item's transfers newest first, ending with its creation", async () => {
    const { status, body } = await get<{
      data: { txHash: string; created: boolean; from: string[]; to: { address: string | null; amount: string }[]; druid: string | null; timestamp: string | null }[];
      pagination: { total: number; hasMore: boolean };
    }>("/api/v1/items/it_a/transfers");
    expect(status).toBe(200);
    expect(body.data.map((t) => [t.txHash, t.created, t.from])).toEqual([
      ["xf_2", false, ["B"]], ["xf_1", false, ["A"]], ["it_a", true, []],
    ]);
    expect(body.data[1]?.to).toEqual([{ address: "B", amount: "2" }, { address: "A", amount: "1" }]);
    expect(body.data[0]).toMatchObject({ druid: null, timestamp: "2024-02-01T00:00:00.000Z" });
    expect(body.pagination).toMatchObject({ total: 3, hasMore: false });
    expect((await get<{ data: unknown[] }>("/api/v1/items/it_a/transfers?limit=1&offset=2")).body.data).toHaveLength(1);
  });

  it("returns an empty transfer list for an unknown item", async () => {
    const { status, body } = await get<{ data: unknown[]; pagination: { total: number } }>("/api/v1/items/nope/transfers");
    expect(status).toBe(200);
    expect(body).toMatchObject({ data: [], pagination: { total: 0 } });
  });

  it("filters the output search by spent", async () => {
    const all = await get<{ data: { txHash: string; genesisHash: string | null; metadata: string | null }[] }>("/api/v1/items?q=alpha");
    expect(all.body.data).toHaveLength(5);
    expect(all.body.data.every((i) => i.genesisHash === "it_a" && i.metadata === ALPHA_META)).toBe(true);
    expect((await get<{ data: unknown[] }>("/api/v1/items?q=alpha&spent=false")).body.data).toHaveLength(3);
    expect((await get<{ data: unknown[] }>("/api/v1/items?q=alpha&spent=true")).body.data).toHaveLength(2);
    expect((await get("/api/v1/items?q=alpha&spent=maybe")).status).toBe(422);
  });

  it("finds a never-transferred item by its genesis hash", async () => {
    const { body } = await get<{ data: { txHash: string; genesisHash: string | null; amountLngx: string | null }[] }>("/api/v1/items?genesis=it_b");
    expect(body.data).toEqual([expect.objectContaining({ txHash: "it_b", genesisHash: "it_b", amountLngx: null })]);
  });

  it("lists the items an address holds", async () => {
    const { status, body } = await get<{ data: unknown[]; pagination: { total: number } }>("/api/v1/addresses/C/items");
    expect(status).toBe(200);
    expect(body.data).toEqual([
      { genesisHash: "it_b", amount: "1", metadata: null },
      { genesisHash: "it_c", amount: "1", metadata: "not json <b>x</b>" },
    ]);
    expect(body.pagination.total).toBe(2);
    expect((await get<{ data: unknown[] }>("/api/v1/addresses/nobody/items")).body.data).toEqual([]);
  });
});
