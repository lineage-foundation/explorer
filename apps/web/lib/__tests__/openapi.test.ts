import { describe, it, expect } from "vitest";
import {
  groupEndpoints, typeLabel, resolveRef, fieldRows, buildExample, curlExample,
  successSchema, anchorId, type OpenApiDoc,
} from "../openapi.js";

const doc: OpenApiDoc = {
  info: { title: "T", version: "1.0.0" },
  servers: [{ url: "https://x.test" }],
  paths: {
    "/api/v1/blocks": {
      get: {
        tags: ["Blocks"], summary: "List blocks",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/BlockList" } } } },
        },
      },
    },
    "/api/v1/addresses/{address}": {
      get: {
        tags: ["Addresses"], summary: "Balance",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string", example: "addr_1" } }],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Address" } } } } },
      },
    },
  },
  components: {
    schemas: {
      BlockSummary: {
        type: "object",
        required: ["num", "hash"],
        properties: {
          num: { type: "integer", description: "Height" },
          hash: { type: "string" },
          previousHash: { type: ["string", "null"] },
        },
      },
      Pagination: { type: "object", properties: { total: { type: "integer" } } },
      BlockList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/BlockSummary" } },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
      },
      Address: { type: "object", required: ["address"], properties: { address: { type: "string", example: "addr_1" }, balance: { type: "string" } } },
    },
  },
};

describe("groupEndpoints", () => {
  it("groups by tag in preferred order with anchors", () => {
    const groups = groupEndpoints(doc);
    expect(groups.map((g) => g.tag)).toEqual(["Blocks", "Addresses"]); // Blocks before Addresses
    expect(groups[0]?.endpoints[0]).toMatchObject({ method: "GET", path: "/api/v1/blocks", id: "get-api-v1-blocks" });
  });
});

describe("anchorId", () => {
  it("slugifies method + path uniquely", () => {
    expect(anchorId("get", "/api/v1/addresses/{address}")).toBe("get-api-v1-addresses-address");
  });
});

describe("typeLabel", () => {
  it("renders enums, nullable, refs, and arrays of refs", () => {
    expect(typeLabel(doc, { type: "string", enum: ["asc", "desc"] })).toBe('"asc" | "desc"');
    expect(typeLabel(doc, { type: ["string", "null"] })).toBe("string | null");
    expect(typeLabel(doc, { $ref: "#/components/schemas/BlockSummary" })).toBe("BlockSummary");
    expect(typeLabel(doc, { type: "array", items: { $ref: "#/components/schemas/BlockSummary" } })).toBe("BlockSummary[]");
  });
});

describe("resolveRef", () => {
  it("follows a $ref into components", () => {
    expect(resolveRef(doc, { $ref: "#/components/schemas/Pagination" }).properties?.total?.type).toBe("integer");
  });
});

describe("fieldRows", () => {
  it("expands nested list schemas with indentation depth", () => {
    const rows = fieldRows(doc, { $ref: "#/components/schemas/BlockList" });
    const data = rows.find((r) => r.name === "data");
    const num = rows.find((r) => r.name === "num");
    expect(data?.type).toBe("BlockSummary[]");
    expect(num?.depth).toBe(1); // nested inside data's item
    expect(num?.required).toBe(true);
    expect(rows.find((r) => r.name === "total")?.depth).toBe(1); // nested inside pagination
  });
});

describe("successSchema", () => {
  it("returns the first 2xx JSON schema", () => {
    const s = successSchema(doc, doc.paths["/api/v1/blocks"]!.get!);
    expect(s?.status).toBe("200");
    expect(s?.schema?.$ref).toBe("#/components/schemas/BlockList");
  });
});

describe("buildExample", () => {
  it("uses field examples and shapes arrays/objects", () => {
    const ex = buildExample(doc, { $ref: "#/components/schemas/BlockList" }) as {
      data: { num: number; hash: string }[]; pagination: { total: number };
    };
    expect(Array.isArray(ex.data)).toBe(true);
    expect(ex.data[0]).toEqual({ num: 0, hash: "string", previousHash: "string" });
    expect(ex.pagination).toEqual({ total: 0 });
  });
  it("prefers an explicit example", () => {
    expect(buildExample(doc, { $ref: "#/components/schemas/Address" })).toMatchObject({ address: "addr_1" });
  });
});

describe("curlExample", () => {
  it("fills path params from examples", () => {
    const ep = { method: "GET", path: "/api/v1/addresses/{address}", id: "x", op: doc.paths["/api/v1/addresses/{address}"]!.get! };
    expect(curlExample("https://x.test", ep)).toBe('curl "https://x.test/api/v1/addresses/addr_1"');
  });
  it("omits query params without examples", () => {
    const ep = { method: "GET", path: "/api/v1/blocks", id: "x", op: doc.paths["/api/v1/blocks"]!.get! };
    expect(curlExample("https://x.test/", ep)).toBe('curl "https://x.test/api/v1/blocks"');
  });
});
