import { LineageNodeClient } from "@explorer/chain";
import { createDb } from "@explorer/db";
import { applyMigrations } from "@explorer/db/migrate";
import { loadConfig } from "./config.js";
import { createWorker } from "./worker.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (config.migrateOnStart) {
    logger.info({ event: "migrate.start", dir: config.migrationsDir }, "applying migrations");
    await applyMigrations(config.databaseUrl, config.migrationsDir);
    logger.info({ event: "migrate.done" }, "migrations applied");
  }
  const { db, sql } = createDb(config.databaseUrl);
  const source = new LineageNodeClient({
    storageNodeUrl: config.storageNodeUrl,
    mempoolNodeUrl: config.mempoolNodeUrl,
    txHttpBatchSize: config.txHttpBatchSize,
    txHttpConcurrency: config.txHttpConcurrency,
    txHttpInterBatchDelayMs: config.txHttpInterBatchDelayMs,
  });
  const worker = createWorker({ config, db, sql, source, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ event: "signal", signal }, "shutting down");
    await worker.stop();
    logger.flush(() => process.exit(0));
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  await worker.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}

export { createWorker };
