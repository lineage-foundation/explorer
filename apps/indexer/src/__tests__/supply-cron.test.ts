import { it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, type Database, schema, getCirculatingSupply } from "@explorer/db";
import { createSupplyCron } from "../supply-cron.js";
import { FakeSourceClient } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };
let handle: { db: Database; close: () => Promise<void> };
beforeAll(() => { handle = createDb(URL); });
afterAll(async () => { await handle.close(); });
beforeEach(async () => { await handle.db.delete(schema.circulatingSupply); });

it("upserts circulating and total supply into a single row idempotently", async () => {
  const source = new FakeSourceClient(); source.setSupply("12345"); source.setTotalSupply("360360000000000000");
  const cron = createSupplyCron({ db: handle.db, source, logger: noopLogger });
  await cron.runOnce();
  let row = await getCirculatingSupply(handle.db);
  expect(row.circulatingSupply).toBe("12345");
  expect(row.totalSupply).toBe("360360000000000000"); // protocol total, not genesis
  source.setSupply("22222");
  await cron.runOnce();
  row = await getCirculatingSupply(handle.db);
  expect(row.circulatingSupply).toBe("22222");
  expect(row.totalSupply).toBe("360360000000000000");
  expect(await handle.db.select().from(schema.circulatingSupply)).toHaveLength(1);
});

it("skips an overlapping run while one is already in flight", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  const source = {
    getLatestBlock: () => Promise.reject(new Error("unused")),
    getBlockRange: () => Promise.resolve([]),
    getTransactionsByHash: () => Promise.resolve([]),
    getCirculatingSupply: async () => { calls += 1; await gate; return "777"; },
    getTotalSupply: async () => "5000",
  };
  const warn = vi.fn();
  const cron = createSupplyCron({ db: handle.db, source, logger: { info: () => {}, warn, error: () => {} } });
  const first = cron.runOnce();          // enters and suspends on the gated fetch
  await Promise.resolve();
  await cron.runOnce();                  // in-flight → skips without touching the source
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: "supply.skip" }), expect.any(String));
  expect(calls).toBe(1);
  release();
  await first;
  expect((await getCirculatingSupply(handle.db)).circulatingSupply).toBe("777");
});
