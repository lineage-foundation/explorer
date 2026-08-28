import { execSync } from "node:child_process";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export default function setup() {
  process.env.DATABASE_URL = TEST_DB_URL;
  execSync("pnpm --filter @explorer/db exec drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}
