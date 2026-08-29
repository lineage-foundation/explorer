import { createDb, type Database } from "@explorer/db";

let cached: { db: Database } | null = null;

export function getDb(): { db: Database } {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db } = createDb(url);
  cached = { db };
  return cached;
}
