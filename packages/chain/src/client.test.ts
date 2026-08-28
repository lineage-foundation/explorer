import { describe, it, expect, vi } from "vitest";
import { LineageNodeClient } from "./client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("LineageNodeClient", () => {
  it("fetches the latest block from /latest_block", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ content: { block: { header: { b_num: 42 }, transactions: [] } } }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    const block = await client.getLatestBlock();
    expect(block.header.b_num).toBe(42);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/latest_block");
  });

  it("posts an inclusive number array to /block_by_num", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ content: [["h1", { block: {} }]] }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await client.getBlockRange(3, 5);
    const init = fetchImpl.mock.calls[0]![1];
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/block_by_num");
    expect(JSON.parse(init.body)).toEqual([3, 4, 5]);
  });

  it("wraps a single hash in quotes for /blockchain_entry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ content: [["h", { inputs: [] }]] }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    await client.getTransactionByHash("abc");
    expect(fetchImpl.mock.calls[0]![1].body).toBe('"abc"');
  });

  it("batches multiple hashes and tolerates a failing batch", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ content: [["h1", { inputs: [] }]] }))
      .mockRejectedValueOnce(new Error("boom"));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl, txHttpBatchSize: 1, txHttpConcurrency: 2 });
    const result = await client.getTransactionsByHash(["h1", "h2"]);
    expect(result).toEqual([["h1", { inputs: [] }]]);
  });

  it("parses issued supply from text with bignumber safety", async () => {
    const big = "90000000000000000000";
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(`{"content": ${big}}`, { status: 200 }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    expect(await client.getIssuedSupply()).toBe(big);
  });

  it("returns '0' when supply response lacks content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nonsense", { status: 200 }));
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    expect(await client.getTotalSupply()).toBe("0");
  });

  it("delegates getCirculatingSupply to the issued-supply endpoint", async () => {
    const big = "12345678901234567890";
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(`{"content": ${big}}`, { status: 200 }),
    );
    const client = new LineageNodeClient({ storageNodeUrl: "http://node", fetchImpl });
    expect(await client.getCirculatingSupply()).toBe(big);
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://node/issued_supply");
  });
});
