import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("addresses routes", () => {
  it("returns a balance with LNGX formatting", async () => {
    const res = await app().request("/api/v1/addresses/addr_1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { address: string; balance: string; balanceLngx: string };
    expect(body).toMatchObject({ address: "addr_1", balance: "500" });
    expect(typeof body.balanceLngx).toBe("string");
    expect(body.balanceLngx).not.toContain(",");
  });

  it("returns balance 0 for an unknown address (never 404)", async () => {
    const res = await app().request("/api/v1/addresses/nobody");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { address: string; balance: string };
    expect(body).toMatchObject({ address: "nobody", balance: "0" });
  });

  it("lists an address's transactions", async () => {
    const res = await app().request("/api/v1/addresses/addr_1/transactions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { hash: string }[]; pagination: { total: number } };
    expect(body.data[0]?.hash).toBe("tx_1");
    expect(body.pagination.total).toBe(1);
  });
});
