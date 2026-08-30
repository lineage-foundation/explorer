import { test, expect } from "@playwright/test";

test("status endpoint returns chain status", async ({ request }) => {
  const res = await request.get("/api/v1/status");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("height");
  expect(body).toHaveProperty("ticker", "LNGX");
});

test("openapi document is 3.1 and lists blocks", async ({ request }) => {
  const res = await request.get("/api/v1/openapi.json");
  expect(res.status()).toBe(200);
  const doc = await res.json();
  expect(doc.openapi).toBe("3.1.0");
  expect(Object.keys(doc.paths)).toContain("/api/v1/blocks");
});

test("unknown block is problem+json 404", async ({ request }) => {
  const res = await request.get("/api/v1/blocks/999999");
  expect(res.status()).toBe(404);
  expect(res.headers()["content-type"]).toContain("application/problem+json");
});
