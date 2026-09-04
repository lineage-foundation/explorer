export interface IndexerConfig {
  databaseUrl: string;
  storageNodeUrl: string;
  mempoolNodeUrl?: string;
  genesisHeight: number;
  maxBlockRange: number;
  pollIntervalMs: number;
  txHttpBatchSize: number;
  txHttpConcurrency: number;
  txHttpInterBatchDelayMs: number;
  supplyCronIntervalMs: number;
  skipTxHashes: string[];
  lockOnBusy: "exit" | "wait";
  healthPort: number | null;
  healthMaxConsecutiveFailures: number;
  reorgMaxDepth: number;
  migrateOnStart: boolean;
  migrationsDir: string;
  logLevel: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function num(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Env var ${key} must be a number, got: ${raw}`);
  return parsed;
}

function parseLockOnBusy(raw: string): "exit" | "wait" {
  if (raw === "exit" || raw === "wait") return raw; // `===` narrows to the literal type
  throw new Error(`INDEXER_LOCK_ON_BUSY must be "exit" or "wait", got: ${raw}`);
}

export function loadConfig(env: NodeJS.ProcessEnv): IndexerConfig {
  const healthPortRaw = env.HEALTH_PORT ?? "8080";
  const lockOnBusy = parseLockOnBusy(env.INDEXER_LOCK_ON_BUSY ?? "exit");
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    storageNodeUrl: required(env, "LINEAGE_STORAGE_NODE_URL"),
    mempoolNodeUrl: env.LINEAGE_MEMPOOL_NODE_URL,
    genesisHeight: num(env, "INDEXER_GENESIS_HEIGHT", 0),
    maxBlockRange: num(env, "INDEXER_MAX_BLOCK_RANGE", 1000),
    pollIntervalMs: num(env, "INDEXER_POLL_INTERVAL_MS", 2000),
    txHttpBatchSize: num(env, "INDEXER_TX_HTTP_BATCH", 200),
    txHttpConcurrency: num(env, "INDEXER_TX_HTTP_CONCURRENCY", 4),
    txHttpInterBatchDelayMs: num(env, "INDEXER_TX_HTTP_INTER_BATCH_DELAY_MS", 0),
    supplyCronIntervalMs: num(env, "SUPPLY_CRON_INTERVAL_MS", 300000),
    skipTxHashes: (env.INDEXER_SKIP_TX_HASHES ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean),
    lockOnBusy,
    healthPort: healthPortRaw === "" ? null : num(env, "HEALTH_PORT", 8080),
    healthMaxConsecutiveFailures: num(env, "INDEXER_HEALTH_MAX_CONSECUTIVE_FAILURES", 10),
    // 0 = always full resync on divergence (default). >0 enables incremental
    // reorg rewind up to this many blocks below the tip, else full resync.
    reorgMaxDepth: num(env, "INDEXER_REORG_MAX_DEPTH", 0),
    // Apply the committed (idempotent) migrations on startup — used in the
    // container image so the indexer converges the schema before ingesting.
    migrateOnStart: (env.INDEXER_MIGRATE_ON_START ?? "false") === "true",
    migrationsDir: env.MIGRATIONS_DIR ?? "./drizzle",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
