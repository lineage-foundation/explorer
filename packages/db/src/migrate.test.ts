import { it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
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

it("backfills druid from druidInfo", async () => {
  const sql = postgres(URL, { max: 1 });
  try {
    await sql`delete from "transaction" where hash = 'mig_tx'`;
    await sql`delete from "block" where hash = 'mig_block'`;
    await sql`insert into "block" (version, num, hash) values (1, 990001, 'mig_block')`;
    await sql`insert into "transaction" (hash, "blockHash", version, "druidInfo")
              values ('mig_tx', 'mig_block', 2, ${sql.json({ druid: "DRUID0xbf", participants: 2, expectations: [] })})`;
    await applyMigrations(URL, DIR);
    const [row] = await sql<{ druid: string | null }[]>`select druid from "transaction" where hash = 'mig_tx'`;
    expect(row?.druid).toBe("DRUID0xbf");
  } finally {
    await sql`delete from "transaction" where hash = 'mig_tx'`;
    await sql`delete from "block" where hash = 'mig_block'`;
    await sql.end({ timeout: 5 });
  }
});

it("backfills itemGenesis for item outputs only", async () => {
  const sql = postgres(URL, { max: 1 });
  const cleanup = async () => {
    await sql`delete from "tx_out" where "txHash" = 'mig_item_tx'`;
    await sql`delete from "transaction" where hash = 'mig_item_tx'`;
    await sql`delete from "block" where hash = 'mig_item_block'`;
  };
  try {
    await cleanup();
    await sql`insert into "block" (version, num, hash) values (1, 990002, 'mig_item_block')`;
    const [tx] = await sql<{ id: number }[]>`insert into "transaction" (hash, "blockHash", version) values ('mig_item_tx', 'mig_item_block', 1) returning id`;
    await sql`insert into "tx_out" ("txId", "txHash", "valueType", amount, locktime, "genesisHash", n) values
      (${tx!.id}, 'mig_item_tx', 'item', '1', '0', null, 0),
      (${tx!.id}, 'mig_item_tx', 'item', '1', '0', 'g_x', 1),
      (${tx!.id}, 'mig_item_tx', 'token', '5', '0', null, 2)`;
    await applyMigrations(URL, DIR);
    const rows = await sql<{ n: number; itemGenesis: string | null }[]>`select n, "itemGenesis" from "tx_out" where "txHash" = 'mig_item_tx' order by n`;
    expect(rows.map((r) => r.itemGenesis)).toEqual(["mig_item_tx", "g_x", null]);
  } finally {
    await cleanup();
    await sql.end({ timeout: 5 });
  }
});
