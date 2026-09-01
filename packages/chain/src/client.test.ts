import { describe, it, expect, vi } from "vitest";
import { LineageNodeClient } from "./client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function textResponse(text: string): Response {
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
}

describe("LineageNodeClient", () => {
  it("fetches the latest block from /v1/blocks/latest (unwraps block.block)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ block: { block: { header: { b_num: 42 }, transactions: [] } } }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const block = await client.getLatestBlock();
    expect(block.header.b_num).toBe(42);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blocks/latest");
  });

  it("GETs /v1/blocks?num=… and maps entries to [hash, {block}]", async () => {
    const entries = [
      { key: "h3", item_meta: { type: "block", block_num: 3, tx_len: 1 }, data: { block: { header: { b_num: 3 } } } },
      { key: "h4", item_meta: { type: "block", block_num: 4, tx_len: 1 }, data: { block: { header: { b_num: 4 } } } },
      { key: "h5", item_meta: { type: "block", block_num: 5, tx_len: 1 }, data: { block: { header: { b_num: 5 } } } },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(entries));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const range = await client.getBlockRange(3, 5);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blocks?num=3&num=4&num=5");
    expect(range).toEqual([
      ["h3", { block: { header: { b_num: 3 } } }],
      ["h4", { block: { header: { b_num: 4 } } }],
      ["h5", { block: { header: { b_num: 5 } } }],
    ]);
  });

  it("chunks a large block range into multiple GETs of <=100 heights", async () => {
    // mockImplementation (not mockResolvedValue) so each real fetch call gets
    // a fresh Response — a single Response's body can only be read once.
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse([]));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await client.getBlockRange(0, 150);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = fetchImpl.mock.calls[0]![0] as string;
    const second = fetchImpl.mock.calls[1]![0] as string;
    expect(first).toContain("num=0");
    expect(first).toContain("num=99");
    expect(first).not.toContain("num=100");
    expect(second).toContain("num=100");
    expect(second).toContain("num=150");
  });

  it("POSTs {keys} to /v1/blockchain-entries/query and maps entries to [hash, tx]", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ key: "h1", item_meta: { type: "tx", block_num: 0, tx_num: 0 }, data: { inputs: [], outputs: [], version: 0, druid_info: null } }]),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const result = await client.getTransactionsByHash(["h1"]);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/v1/blockchain-entries/query");
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ keys: ["h1"] });
    expect(result).toEqual([["h1", { inputs: [], outputs: [], version: 0, druid_info: null }]]);
  });

  it("tolerates a failing batch by returning no entries for it", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ key: "h1", item_meta: {}, data: { inputs: [] } }]))
      .mockRejectedValue(new Error("boom"));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl, txHttpBatchSize: 1, txHttpConcurrency: 2 });
    const result = await client.getTransactionsByHash(["h1", "h2"]);
    expect(result).toEqual([["h1", { inputs: [] }]]);
  });

  it("parses supply from /v1/supply raw text, preserving digits beyond 2^53", async () => {
    const big = { total: 360360000000000000, issued: 90091258856512411 };
    // Emit the exact large integers as raw JSON text (no JS-number round-trip).
    const raw = `{"total":360360000000000000,"issued":90091258856512411}`;
    // mockImplementation so getIssuedSupply()'s and getTotalSupply()'s
    // separate fetch calls each get a fresh, unread Response.
    const fetchImpl = vi.fn().mockImplementation(() => textResponse(raw));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", mempoolNodeUrl: "http://mempool", fetchImpl });
    expect(await client.getIssuedSupply()).toBe("90091258856512411");
    expect(await client.getTotalSupply()).toBe("360360000000000000");
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://mempool/v1/supply");
    // Sanity: JSON.parse would have corrupted these.
    expect(String(big.issued)).not.toBe("90091258856512411");
  });

  it("retries a transient empty body and then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ block: { block: { header: { b_num: 7 }, transactions: [] } } }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const block = await client.getLatestBlock();
    expect(block.header.b_num).toBe(7);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws a descriptive error (not a raw SyntaxError) when the body stays empty", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => new Response("", { status: 200 }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await expect(client.getLatestBlock()).rejects.toThrow(
      /getLatestBlock request to http:\/\/node\/v1\/blocks\/latest failed after 3 attempts: empty response body \(HTTP 200\)/,
    );
    await expect(client.getLatestBlock()).rejects.not.toThrow(/Unexpected end of JSON input/);
  });

  it("surfaces a non-2xx problem+json status with a body snippet", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      () => new Response(JSON.stringify({ title: "Not Found", status: 404 }), { status: 404 }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await expect(client.getBlockRange(1, 1)).rejects.toThrow(/HTTP 404: /);
  });

  it("propagates a supply HTTP error instead of resolving to 0", async () => {
    // A transient node error must NOT be reported as a legitimate zero supply,
    // or the supply cron would clobber the last-good value with 0.
    const fetchImpl = vi.fn().mockImplementation(
      () => new Response(JSON.stringify({ title: "Bad Gateway", status: 502 }), { status: 502 }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", mempoolNodeUrl: "http://mempool", fetchImpl });
    await expect(client.getIssuedSupply()).rejects.toThrow(/getSupply\(issued\) request to http:\/\/mempool\/v1\/supply failed after 3 attempts: HTTP 502/);
  });

  it("propagates a supply network error instead of resolving to 0", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", mempoolNodeUrl: "http://mempool", fetchImpl });
    await expect(client.getTotalSupply()).rejects.toThrow(/getSupply\(total\) request to http:\/\/mempool\/v1\/supply failed after 3 attempts: ECONNREFUSED/);
  });

  it("returns 0 for supply only when the field is genuinely absent from a valid body", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => textResponse('{"total":360360000000000000}'));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", mempoolNodeUrl: "http://mempool", fetchImpl });
    expect(await client.getIssuedSupply()).toBe("0");
    expect(await client.getTotalSupply()).toBe("360360000000000000");
  });
});
