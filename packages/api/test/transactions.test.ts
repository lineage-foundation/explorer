import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("transactions routes", () => {
  it("lists non-coinbase transactions", async () => {
    const res = await app().request("/api/v1/transactions?limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { hash: string }[]; pagination: { total: number } };
    expect(body.data.map((t) => t.hash)).toEqual(["tx_2", "tx_1"]);
    expect(body.pagination.total).toBe(2);
  });

  it("returns full transaction detail with resolved inputs and amounts", async () => {
    const res = await app().request("/api/v1/transactions/tx_2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hash: string;
      type: string;
      inputs: { fromAddress: string | null; amount: string | null; amountLngx: string | null }[];
    };
    expect(body).toMatchObject({ hash: "tx_2", type: "unknown" });
    expect(body.inputs[0]).toMatchObject({ fromAddress: "addr_1", amount: "500" });
    expect(typeof body.inputs[0]?.amountLngx).toBe("string");
  });

  it("serializes outputs with address and amountLngx", async () => {
    const res = await app().request("/api/v1/transactions/tx_1");
    const body = (await res.json()) as {
      outputs: { n: number; valueType: string; amount: string | null; address: string | null; amountLngx: string | null }[];
    };
    expect(body.outputs[0]).toMatchObject({ n: 0, valueType: "token", amount: "500", address: "addr_1" });
    expect(typeof body.outputs[0]?.amountLngx).toBe("string");
  });

  it("404s an unknown transaction", async () => {
    const res = await app().request("/api/v1/transactions/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });
});
