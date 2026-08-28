import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup.ts"],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
