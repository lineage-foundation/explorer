import { describe, it, expect, afterAll } from "vitest";
import { createDb } from "@explorer/db";
import { createAdvisoryLock } from "../advisory-lock.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

describe("advisory lock", () => {
  const a = createDb(URL);
  const b = createDb(URL);
  afterAll(async () => { await a.close(); await b.close(); });

  it("grants to the first holder and denies the second, then re-grants after release", async () => {
    const lockA = createAdvisoryLock(a.sql);
    const lockB = createAdvisoryLock(b.sql);
    expect(await lockA.tryAcquire()).toBe(true);
    expect(await lockB.tryAcquire()).toBe(false);
    await lockA.release();
    expect(await lockB.tryAcquire()).toBe(true);
    await lockB.release();
  });
});
