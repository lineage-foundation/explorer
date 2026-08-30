import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => { handle = createDb(URL); await seedFixtures(handle.db); });
afterAll(async () => { await handle.close(); });

describe("meta routes", () => {
  it("returns circulating supply with LNGX + ticker", async () => {
    const res = await app().request("/api/v1/supply");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { circulating: string; circulatingLngx: string; ticker: string };
    expect(body).toMatchObject({ circulating: "12345", ticker: "LNGX" });
    expect(typeof body.circulatingLngx).toBe("string");
    expect(body.circulatingLngx).not.toContain(",");
  });

  it("returns chain status", async () => {
    const res = await app().request("/api/v1/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      network: string;
      ticker: string;
      height: number | null;
      blocks: number;
      transactions: number;
    };
    expect(body).toMatchObject({ network: "Lineage", ticker: "LNGX", height: 2, blocks: 2, transactions: 3 });
  });

  it("serves an OpenAPI 3.1 document covering every path", async () => {
    const res = await app().request("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe("3.1.0");
    for (const path of [
      "/api/v1/blocks", "/api/v1/blocks/{id}", "/api/v1/blocks/{id}/transactions",
      "/api/v1/transactions", "/api/v1/transactions/{hash}",
      "/api/v1/addresses/{address}", "/api/v1/addresses/{address}/transactions",
      "/api/v1/supply", "/api/v1/status",
    ]) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
    expect(doc.components.schemas).toHaveProperty("Problem");
  });

  it("serves the Scalar docs page as HTML", async () => {
    const res = await app().request("/api/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
