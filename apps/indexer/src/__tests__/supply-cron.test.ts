import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDb, type Database, schema, getCirculatingSupply } from "@explorer/db";
import { createSupplyCron } from "../supply-cron.js";
import { FakeSourceClient } from "./fake-source.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };
let handle: { db: Database; close: () => Promise<void> };
beforeAll(() => { handle = createDb(URL); });
afterAll(async () => { await handle.close(); });
beforeEach(async () => { await handle.db.delete(schema.circulatingSupply); });

it("upserts the single circulating_supply row idempotently", async () => {
  const source = new FakeSourceClient(); source.setSupply("12345");
  const cron = createSupplyCron({ db: handle.db, source, logger: noopLogger });
  await cron.runOnce();
  expect((await getCirculatingSupply(handle.db)).circulatingSupply).toBe("12345");
  source.setSupply("22222");
  await cron.runOnce();
  expect((await getCirculatingSupply(handle.db)).circulatingSupply).toBe("22222");
  expect(await handle.db.select().from(schema.circulatingSupply)).toHaveLength(1);
});
