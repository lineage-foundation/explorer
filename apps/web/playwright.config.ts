import { defineConfig } from "@playwright/test";

const DB = process.env.DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  webServer: {
    // next start does NOT work with output: "standalone"; next dev serves
    // everything with no build/standalone-static pitfalls.
    command: "pnpm -F @explorer/web dev",
    url: "http://127.0.0.1:8080",
    timeout: 120000,
    reuseExistingServer: false,
    env: { DATABASE_URL: DB },
  },
  use: { baseURL: "http://127.0.0.1:8080" },
});
