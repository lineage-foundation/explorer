import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Database } from "@explorer/db";
import { createApiApp } from "../src/index.js";
import { seedFixtures, seedTradeFixtures } from "./fixtures.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
let handle: { db: Database; close: () => Promise<void> };
const app = () => createApiApp({ db: handle.db });

beforeAll(async () => {
  handle = createDb(URL);
  await seedFixtures(handle.db);
  await seedTradeFixtures(handle.db);
});
afterAll(async () => { await handle.close(); });

interface Leg {
  from: string[] | null; to: string; txHash: string | null; met: boolean;
  asset: { kind: string; amount: string; amountLngx: string | null; genesisHash: string | null; metadata: string | null };
}
interface TradeBody {
  druid: string; participants: number; complete: boolean; blockNum: number; blockHash: string;
  timestamp: string | null; legs: Leg[]; transactions: string[];
}

describe("trades routes", () => {
  it("lists trades with pagination", async () => {
    const res = await app().request("/api/v1/trades?limit=10");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=10");
    const body = (await res.json()) as { data: TradeBody[]; pagination: { total: number; hasMore: boolean } };
    expect(body.data.map((s) => s.druid).sort()).toEqual(["DRUID0xs1", "odd druid/1"]);
    expect(body.pagination).toMatchObject({ total: 2, hasMore: false });
  });

  it("returns one trade with both legs", async () => {
    const res = await app().request("/api/v1/trades/DRUID0xs1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as TradeBody;
    expect(body).toMatchObject({
      druid: "DRUID0xs1", participants: 2, complete: true, blockNum: 3, blockHash: "b_hash_3",
      timestamp: "2024-01-03T00:00:00.000Z", transactions: ["trade_half_a", "trade_half_b"],
    });
    expect(body.legs).toEqual([
      {
        from: ["trade_b"], to: "trade_a", txHash: "trade_half_b", met: true,
        asset: { kind: "token", amount: "1000", amountLngx: expect.stringMatching(/^0\.0000/), genesisHash: null, metadata: null },
      },
      {
        from: ["trade_a"], to: "trade_b", txHash: "trade_half_a", met: true,
        asset: { kind: "item", amount: "1", amountLngx: null, genesisHash: "gen_s", metadata: null },
      },
    ]);
  });

  it("reaches a non-canonical druid when URL-encoded", async () => {
    const res = await app().request(`/api/v1/trades/${encodeURIComponent("odd druid/1")}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as TradeBody).druid).toBe("odd druid/1");
  });

  it("404s an unknown druid as problem+json", async () => {
    const res = await app().request("/api/v1/trades/DRUID0xnope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("exposes the druid and item-aware inputs on a trade half", async () => {
    const res = await app().request("/api/v1/transactions/trade_half_a");
    const body = (await res.json()) as {
      druid: string | null;
      inputs: { valueType: string | null; genesisHash: string | null; amount: string | null; amountLngx: string | null }[];
      outputs: { valueType: string; amount: string | null; amountLngx: string | null }[];
    };
    expect(body.druid).toBe("DRUID0xs1");
    expect(body.inputs).toEqual([expect.objectContaining({ valueType: "item", genesisHash: "gen_s", amount: "1", amountLngx: null })]);
    expect(body.outputs).toEqual([expect.objectContaining({ valueType: "item", amount: "1", amountLngx: null })]);
  });

  it("keeps amountLngx for token inputs and outputs", async () => {
    const res = await app().request("/api/v1/transactions/trade_half_b");
    const body = (await res.json()) as {
      inputs: { valueType: string | null; amountLngx: string | null }[];
      outputs: { amountLngx: string | null }[];
    };
    expect(body.inputs[0]).toMatchObject({ valueType: "token" });
    expect(typeof body.inputs[0]?.amountLngx).toBe("string");
    expect(body.outputs.every((o) => typeof o.amountLngx === "string")).toBe(true);
  });

  it("carries the druid on transaction, block and address lists", async () => {
    const list = (await (await app().request("/api/v1/transactions?limit=100")).json()) as { data: { hash: string; druid: string | null }[] };
    expect(list.data.find((t) => t.hash === "trade_half_a")?.druid).toBe("DRUID0xs1");
    expect(list.data.find((t) => t.hash === "tx_1")?.druid).toBeNull();
    const blockTxs = (await (await app().request("/api/v1/blocks/3/transactions")).json()) as { data: { hash: string; druid: string | null }[] };
    expect(blockTxs.data.find((t) => t.hash === "odd_half_b")?.druid).toBe("odd druid/1");
    const addr = (await (await app().request("/api/v1/addresses/trade_a/transactions")).json()) as { data: { hash: string; druid: string | null }[] };
    expect(addr.data.find((t) => t.hash === "trade_half_a")?.druid).toBe("DRUID0xs1");
  });
});
