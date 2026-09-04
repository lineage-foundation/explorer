import { it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, readMigrationStatements } from "./migrate.js";

const URL = process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

it("reads ordered migration statements from the drizzle dir", () => {
  const statements = readMigrationStatements(DIR);
  expect(statements.length).toBeGreaterThan(0);
  expect(statements.some((s) => /create table if not exists "block"/i.test(s))).toBe(true);
});

it("applies migrations idempotently and non-destructively (safe to re-run)", async () => {
  // globalSetup already migrated this DB; re-applying must converge, not throw.
  await expect(applyMigrations(URL, DIR)).resolves.toBeUndefined();
  await expect(applyMigrations(URL, DIR)).resolves.toBeUndefined();
});
