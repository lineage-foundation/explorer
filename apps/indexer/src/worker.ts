import type { Database } from "@explorer/db";
import type postgres from "postgres";
import type { IndexerConfig } from "./config.js";
import type { SourceClient } from "./source.js";
import { createIngestor, ContinuityError, type WorkerLogger } from "./ingestor.js";
import { createSupplyCron } from "./supply-cron.js";
import { createHealthServer, type Status } from "./health-server.js";
import { createAdvisoryLock } from "./advisory-lock.js";

export function createWorker(deps: {
  config: IndexerConfig;
  db: Database;
  sql: ReturnType<typeof postgres>;
  source: SourceClient;
  logger: WorkerLogger;
}): { start: () => Promise<void>; stop: () => Promise<void>; runCycleOnce: () => Promise<void> } {
  const { config, db, sql, source, logger } = deps;
  const ingestor = createIngestor({ db, source, config, logger });
  const supplyCron = createSupplyCron({ db, source, logger });
  const lock = createAdvisoryLock(sql);

  let running = false;
  let supplyTimer: NodeJS.Timeout | null = null;
  let healthServer: ReturnType<typeof createHealthServer> | null = null;
  const status: Status = {
    lastIndexedBlock: null,
    chainTip: null,
    lag: null,
    lockHeld: false,
    lastSupplyUpdate: null,
    halted: null,
  };

  async function loop(): Promise<void> {
    while (running) {
      try {
        const tip = (await source.getLatestBlock()).header.b_num;
        status.chainTip = tip;
        const result = await ingestor.runCycle();
        if (result.processedTo !== undefined) {
          status.lastIndexedBlock = result.processedTo;
          status.lag = tip - result.processedTo;
        }
        if (result.caughtUp) await sleep(config.pollIntervalMs);
      } catch (err) {
        if (err instanceof ContinuityError) {
          status.halted = err.message;
          logger.error({ event: "halted", err: err.message }, "ingestion halted");
          return; // stop the loop; health flips to 503
        }
        logger.error({ event: "cycle.error", err: String(err) }, "ingest cycle failed; retrying");
        await sleep(config.pollIntervalMs);
      }
    }
  }

  return {
    async runCycleOnce() {
      await ingestor.runCycle();
    },
    async start() {
      const acquired = await lock.tryAcquire();
      status.lockHeld = acquired;
      if (!acquired) {
        logger.error({ event: "lock.busy" }, "another indexer holds the lock");
        if (config.lockOnBusy === "exit") {
          process.exit(1);
        }
        while (!(await lock.tryAcquire())) await sleep(config.pollIntervalMs);
        status.lockHeld = true;
      }
      running = true;
      if (config.healthPort !== null) {
        healthServer = createHealthServer({ port: config.healthPort, getStatus: () => status });
        await healthServer.start();
      }
      await supplyCron.runOnce();
      status.lastSupplyUpdate = timestamp();
      supplyTimer = setInterval(() => {
        void supplyCron.runOnce().then(() => {
          status.lastSupplyUpdate = timestamp();
        });
      }, config.supplyCronIntervalMs);
      logger.info({ event: "worker.start" }, "indexer started");
      void loop();
    },
    async stop() {
      if (!running) return;
      running = false;
      if (supplyTimer) clearInterval(supplyTimer);
      if (healthServer) await healthServer.stop();
      await lock.release();
      logger.info({ event: "worker.stop" }, "indexer stopped");
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function timestamp(): string {
  return new Date(Date.now()).toISOString();
}
