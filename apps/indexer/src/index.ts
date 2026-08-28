import { createDb } from "@explorer/db";
import { logger as defaultLogger } from "./logger.js";

interface WorkerLogger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}
interface DbHandle {
  db: unknown;
  close: () => Promise<void>;
}
interface WorkerDeps {
  logger: WorkerLogger;
  dbHandle: DbHandle;
}

// setInterval's delay is a 32-bit signed int under the hood, so this is the
// largest safe interval (~12.4 days) rather than a literal "forever"; the
// timer just needs to keep firing far less often than any expected restart.
const KEEP_ALIVE_MS = 1 << 30;

export function createWorker(deps: WorkerDeps): { start: () => Promise<void>; stop: () => Promise<void> } {
  let running = false;
  // No ingestion logic yet: this interval only keeps the Node.js event loop
  // alive (a long-running worker process with no open sockets/timers would
  // otherwise exit immediately after start(), before it can receive a
  // shutdown signal). It is cleared in stop().
  let keepAlive: NodeJS.Timeout | undefined;
  return {
    async start() {
      running = true;
      keepAlive = setInterval(() => {}, KEEP_ALIVE_MS);
      deps.logger.info({ event: "worker.start" }, "indexer started");
    },
    async stop() {
      if (!running) return;
      running = false;
      clearInterval(keepAlive);
      await deps.dbHandle.close();
      deps.logger.info({ event: "worker.stop" }, "indexer stopped");
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    defaultLogger.error({ event: "config.missing" }, "DATABASE_URL is required");
    process.exit(1);
  }
  const dbHandle = createDb(url);
  const worker = createWorker({ logger: defaultLogger, dbHandle });
  const shutdown = async (signal: string) => {
    defaultLogger.info({ event: "signal", signal }, "shutting down");
    await worker.stop();
    // Flush pino's destination before exiting so the final log lines above
    // (and any emitted by worker.stop()) are not dropped mid-write.
    defaultLogger.flush(() => process.exit(0));
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  await worker.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
