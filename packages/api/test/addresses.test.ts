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

  it("lists an address's transactions (receipts and spends) with a running balance", async () => {
    const res = await app().request("/api/v1/addresses/addr_1/transactions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { hash: string; blockNum: number; balanceAfter: string; balanceAfterLngx: string }[];
      pagination: { total: number };
    };
    // tx_1 pays addr_1; tx_2 spends addr_1's output. Both appear, newest first.
    expect(body.data.map((t) => t.hash)).toEqual(["tx_2", "tx_1"]);
    expect(body.pagination.total).toBe(2);
    expect(typeof body.data[0]?.balanceAfter).toBe("string");
    expect(typeof body.data[0]?.balanceAfterLngx).toBe("string");
    expect(body.data[0]?.blockNum).toBe(2);
  });
});
