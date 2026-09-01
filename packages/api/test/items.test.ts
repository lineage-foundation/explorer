import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, schema, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => {
  handle = createDb(URL);
  await seedFixtures(handle.db);
  // Item fixtures live here (not in the shared seed) so they don't shift the
  // transaction counts other route tests assert. tx_item1 uses a >2^53 amount.
  await handle.db.insert(schema.transaction).values([
    { hash: "tx_item1", blockHash: "b_hash_2", version: 1, coinbase: false },
    { hash: "tx_item2", blockHash: "b_hash_2", version: 1, coinbase: false },
  ]);
  await handle.db.insert(schema.txOut).values([
    { txId: 4, txHash: "tx_item1", valueType: "item", amount: "123456789012345678", locktime: "0", scriptPublicKey: "owner_x", genesisHash: "gen_1", itemMetadata: '{"name":"Relic","rarity":"epic"}', n: 0 },
    { txId: 5, txHash: "tx_item2", valueType: "item", amount: "1", locktime: "0", scriptPublicKey: "owner_y", genesisHash: "gen_2", itemMetadata: "dragon scale", n: 0 },
  ]);
});
afterAll(async () => { await handle.close(); });

interface ItemRow {
  genesisHash: string | null; metadata: string | null; address: string | null;
  amount: string | null; amountLngx: string | null; spent: boolean;
  txHash: string; n: number; blockNum: number; blockHash: string; timestamp: string | null;
}

describe("items route", () => {
  it("finds items by a case-insensitive metadata substring", async () => {
    const res = await app().request("/api/v1/items?q=relic");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ItemRow[]; pagination: unknown };
    expect(body.data).toHaveLength(1);
    const item = body.data[0]!;
    expect(item.genesisHash).toBe("gen_1");
    expect(item.txHash).toBe("tx_item1");
    expect(item.spent).toBe(false);
    // >2^53 amount round-trips exactly as a string, with a formatted companion
    expect(item.amount).toBe("123456789012345678");
    expect(typeof item.amountLngx).toBe("string");
    expect(body.pagination).toMatchObject({ total: 1, hasMore: false });
  });

  it("filters by exact genesis hash", async () => {
    const res = await app().request("/api/v1/items?genesis=gen_2");
    const body = (await res.json()) as { data: ItemRow[] };
    expect(body.data.map((i) => i.txHash)).toEqual(["tx_item2"]);
    expect(body.data[0]?.metadata).toBe("dragon scale");
  });

  it("422s when neither q nor genesis is provided", async () => {
    const res = await app().request("/api/v1/items");
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("422s an over-long q (path/query length bound)", async () => {
    const res = await app().request(`/api/v1/items?q=${"a".repeat(200)}`);
    expect(res.status).toBe(422);
  });

  it("422s an offset beyond the deep-offset cap", async () => {
    const res = await app().request("/api/v1/items?genesis=gen_1&offset=100001");
    expect(res.status).toBe(422);
  });
});
