import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  // Inline the workspace packages (they export raw .ts) AND their third-party
  // deps so `node dist/index.js` runs with no node_modules. If a specific dep
  // cannot be bundled cleanly (e.g. pino's worker/transport files), mark ONLY
  // that dep in `external` below and ensure Task 8's image provides it.
  noExternal: [/^(?!pino$).*/],
  external: ["pino"],
});
