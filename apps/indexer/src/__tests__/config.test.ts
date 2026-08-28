import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  LINEAGE_STORAGE_NODE_URL: "http://node:3001",
};

describe("loadConfig", () => {
  it("applies documented defaults", () => {
    const c = loadConfig({ ...base });
    expect(c.genesisHeight).toBe(0);
    expect(c.maxBlockRange).toBe(1000);
    expect(c.pollIntervalMs).toBe(2000);
    expect(c.supplyCronIntervalMs).toBe(300000);
    expect(c.lockOnBusy).toBe("exit");
    expect(c.skipTxHashes).toEqual([]);
    expect(c.healthPort).toBe(8080);
  });

  it("parses overrides and a comma-separated skip list", () => {
    const c = loadConfig({ ...base, INDEXER_MAX_BLOCK_RANGE: "500", INDEXER_SKIP_TX_HASHES: "a, b" });
    expect(c.maxBlockRange).toBe(500);
    expect(c.skipTxHashes).toEqual(["a", "b"]);
  });

  it("throws when a required var is missing", () => {
    expect(() => loadConfig({ LINEAGE_STORAGE_NODE_URL: "x" })).toThrow(/DATABASE_URL/);
  });

  it("throws on a non-numeric numeric var", () => {
    expect(() => loadConfig({ ...base, INDEXER_POLL_INTERVAL_MS: "soon" })).toThrow(/INDEXER_POLL_INTERVAL_MS/);
  });
});
