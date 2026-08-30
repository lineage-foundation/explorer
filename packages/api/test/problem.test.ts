import { describe, it, expect } from "vitest";
import { createDb } from "@explorer/db";
import { createApiApp } from "../src/index.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

describe("problem details", () => {
  it("returns RFC 9457 problem+json for an unknown route", async () => {
    const { db } = createDb(URL);
    const app = createApiApp({ db });
    const res = await app.request("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ title: "Not Found", status: 404 });
    expect(body.instance).toBe("/api/v1/does-not-exist");
  });
});
