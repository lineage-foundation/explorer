import { sql } from "drizzle-orm";
import type { Database } from "@explorer/db";
import { schema } from "@explorer/db";
import type { SourceClient } from "./source.js";
import type { WorkerLogger } from "./ingestor.js";

export function createSupplyCron(deps: { db: Database; source: SourceClient; logger: WorkerLogger }): {
  runOnce: () => Promise<void>;
} {
  const { db, source, logger } = deps;
  let inFlight = false;
  return {
    async runOnce() {
      // Skip if a previous run is still going (a slow fetch + the interval timer
      // could otherwise overlap and let a stale write land after a fresh one).
      if (inFlight) {
        logger.warn({ event: "supply.skip" }, "supply update already in progress; skipping");
        return;
      }
      inFlight = true;
      try {
        const [circulating, total] = await Promise.all([
          source.getCirculatingSupply(),
          source.getTotalSupply(),
        ]);
        await db.insert(schema.circulatingSupply)
          .values({ id: 1, circulatingSupply: circulating, totalSupply: total })
          .onConflictDoUpdate({
            target: schema.circulatingSupply.id,
            set: { circulatingSupply: circulating, totalSupply: total, updatedAt: sql`now()` },
          });
        logger.info({ event: "supply.updated", circulating, total }, "supply updated");
      } catch (err) {
        logger.error({ event: "supply.error", err: String(err) }, "supply update failed");
      } finally {
        inFlight = false;
      }
    },
  };
}
