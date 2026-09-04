import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { readMigrationStatements } from "./migrate.js";

const APP_TABLES = [
  "block",
  "transaction",
  "tx_in",
  "tx_out",
  "tx_in_expanded",
  "coins_history",
  "circulating_supply",
] as const;

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/**
 * Prepare a database for tests by applying the committed migration directly and
 * clearing all data. The generated migration is idempotent (CREATE ... IF NOT
 * EXISTS, foreign keys guarded by `duplicate_object`) and correctly ordered
 * (unique indexes before the FKs that reference them), so applying it converges
 * any prior state to the correct schema — including repairing a database whose
 * FKs a previous `drizzle-kit push` failed to create. We deliberately avoid
 * `drizzle-kit push` (mis-orders FKs on a fresh DB) and `drizzle-kit migrate`
 * (its applied-state table can survive a schema drop and turn the re-apply into
 * a no-op). TRUNCATE ... RESTART IDENTITY gives each run the same clean,
 * id-1-based state that the fixtures assume.
 */
export async function resetTestSchema(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const statement of readMigrationStatements(DRIZZLE_DIR)) {
      await sql.unsafe(statement);
    }
    await sql.unsafe(
      `TRUNCATE TABLE ${APP_TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
