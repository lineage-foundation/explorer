import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: { table: "_migrations" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
