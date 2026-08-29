import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts", "app/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
