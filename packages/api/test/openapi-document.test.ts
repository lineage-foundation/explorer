import { describe, it, expect } from "vitest";
import { getOpenApiDocument } from "../src/openapi-document.js";

describe("getOpenApiDocument", () => {
  it("generates the 3.1 document from the routes without a database", () => {
    const doc = getOpenApiDocument() as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, { tags?: string[]; parameters?: { name: string }[] }>>;
      components?: { schemas?: Record<string, unknown> };
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Lineage Explorer API");
    for (const path of [
      "/api/v1/blocks", "/api/v1/blocks/{id}", "/api/v1/blocks/{id}/transactions",
      "/api/v1/transactions", "/api/v1/transactions/{hash}",
      "/api/v1/addresses/{address}", "/api/v1/addresses/{address}/transactions",
      "/api/v1/items", "/api/v1/supply", "/api/v1/status",
    ]) {
      expect(Object.keys(doc.paths)).toContain(path);
    }
    // Tags and parameters are captured (the docs page groups + tabulates them).
    expect(doc.paths["/api/v1/blocks"]?.get?.tags).toEqual(["Blocks"]);
    expect(doc.paths["/api/v1/items"]?.get?.parameters?.map((p) => p.name)).toEqual(
      expect.arrayContaining(["q", "genesis", "limit", "offset"]),
    );
    // Response schemas are registered as reusable components (resolved by $ref).
    expect(doc.components?.schemas).toBeTruthy();
    expect(Object.keys(doc.components?.schemas ?? {}).length).toBeGreaterThan(5);
  });
});
