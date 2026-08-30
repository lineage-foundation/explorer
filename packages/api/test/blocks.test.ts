import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => {
  handle = createDb(URL);
  await seedFixtures(handle.db);
});
afterAll(async () => { await handle.close(); });

describe("blocks routes", () => {
  it("lists blocks with a pagination envelope", async () => {
    const res = await app().request("/api/v1/blocks?limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { num: number }[]; pagination: unknown };
    expect(body.data[0]?.num).toBe(2);
    expect(body.pagination).toMatchObject({ total: 2, limit: 10, offset: 0, hasMore: false });
  });

  it("returns a single block by number with bits as a string", async () => {
    const res = await app().request("/api/v1/blocks/1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { num: number; hash: string; timestamp: string | null };
    expect(body).toMatchObject({ num: 1, hash: "b_hash_1" });
    expect(body.timestamp).toBe("2024-01-01T00:00:00.000Z");
  });

  it("404s an unknown block as problem+json", async () => {
    const res = await app().request("/api/v1/blocks/999999");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("lists a block's transactions with the coinbase first", async () => {
    const res = await app().request("/api/v1/blocks/2/transactions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { hash: string; type: string; coinbase: boolean }[] };
    expect(body.data.map((t) => t.hash)).toEqual(["tx_cb", "tx_2"]);
    expect(body.data[0]).toMatchObject({ type: "coinbase", coinbase: true });
  });

  it("422s an invalid limit as problem+json", async () => {
    const res = await app().request("/api/v1/blocks?limit=abc");
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });
});
