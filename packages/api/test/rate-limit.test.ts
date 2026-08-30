import { describe, it, expect } from "vitest";
import { createDb } from "@explorer/db";
import { createApiApp } from "../src/index.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

function app() {
  const { db } = createDb(URL);
  return createApiApp({ db, rateLimit: { limit: 2, windowSeconds: 60 } });
}

describe("rate limiting", () => {
  it("allows requests up to the limit and sets RateLimit headers", async () => {
    const a = app();
    const res = await a.request("/api/v1/nope", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(res.headers.get("RateLimit-Limit")).toBe("2");
    expect(res.headers.get("RateLimit-Remaining")).toBe("1");
  });

  it("returns 429 problem+json with Retry-After once the bucket is empty", async () => {
    const a = app();
    const headers = { "x-forwarded-for": "2.2.2.2" };
    await a.request("/api/v1/nope", { headers });
    await a.request("/api/v1/nope", { headers });
    const res = await a.request("/api/v1/nope", { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.headers.get("Retry-After")).not.toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({ title: "Too Many Requests", status: 429 });
  });
});
