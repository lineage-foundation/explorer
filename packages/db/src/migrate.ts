import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/**
 * All committed migration statements, in order across every `*.sql` file in
 * `migrationsDir`, split on drizzle's `--> statement-breakpoint`.
 */
export function readMigrationStatements(migrationsDir: string): string[] {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`No migration .sql found in ${migrationsDir}`);
  return files.flatMap((file) =>
    readFileSync(join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0),
  );
}

/**
 * Apply the committed migrations to a database, non-destructively. The generated
 * migrations are idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
 * FKs guarded in DO blocks), so this is safe to run on every deploy — it
 * converges any prior state to the current schema without touching data.
 */
export async function applyMigrations(connectionString: string, migrationsDir: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const statement of readMigrationStatements(migrationsDir)) {
      await sql.unsafe(statement);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
