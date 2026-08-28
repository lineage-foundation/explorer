import { execSync } from "node:child_process";
import postgres from "postgres";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@localhost:5432/explorer_test";

function push(): void {
  // drizzle-kit push (0.24.x) prints a PostgresError to stdout and *still
  // exits 0* when a statement mid-batch fails, so execSync will not throw
  // here even on failure. Callers must verify the resulting schema state
  // rather than relying on a thrown error.
  execSync("pnpm exec drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}

export default async function setup() {
  process.env.DATABASE_URL = TEST_DB_URL;

  // First pass: creates the base tables. On a fresh database this run's
  // later statements fail (see below) but exits 0 regardless, so we always
  // continue to the workaround step rather than branching on success.
  push();

  // drizzle-kit push generates ALTER TABLE ... ADD CONSTRAINT (FK)
  // statements before the CREATE UNIQUE INDEX statements for the columns
  // those FKs reference (block.hash, block.num, transaction.hash are
  // declared via a standalone uniqueIndex(), not an inline .unique()). On a
  // fresh database this makes the FK statements fail with "there is no
  // unique constraint matching given keys" even though the base tables get
  // created first. Work around it by creating the missing unique indexes
  // directly (idempotent — safe if they already exist), then re-running
  // push so the FK statements have something to reference.
  const sql = postgres(TEST_DB_URL, { max: 1 });
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS "UK_block_hash" ON "block" USING btree ("hash")`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS "UK_block_num" ON "block" USING btree ("num")`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS "UK_transaction_hash" ON "transaction" USING btree ("hash")`;

    // queries.test.ts's beforeAll clears rows with DELETE (not TRUNCATE), so
    // serial id sequences (notably tx_out.id, which getAccountBalance's test
    // hard-codes as 1 via coins_history.outIds) keep advancing across
    // repeated test runs against a database that isn't recreated from
    // scratch each time. Reset every table + its identity sequence here so
    // each suite run starts from the same clean, id-1-based state.
    await sql`TRUNCATE TABLE "block", "transaction", "tx_in", "tx_out", "tx_in_expanded", "coins_history", "circulating_supply" RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  push();
}
