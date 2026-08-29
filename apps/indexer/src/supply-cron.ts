import { sql } from "drizzle-orm";
import type { Database } from "@explorer/db";
import { schema } from "@explorer/db";
import type { SourceClient } from "./source.js";
import type { WorkerLogger } from "./ingestor.js";

export function createSupplyCron(deps: { db: Database; source: SourceClient; logger: WorkerLogger }): {
  runOnce: () => Promise<void>;
} {
  const { db, source, logger } = deps;
  return {
    async runOnce() {
      try {
        const value = await source.getCirculatingSupply();
        await db.insert(schema.circulatingSupply)
          .values({ id: 1, circulatingSupply: value })
          .onConflictDoUpdate({
            target: schema.circulatingSupply.id,
            set: { circulatingSupply: value, updatedAt: sql`now()` },
          });
        logger.info({ event: "supply.updated", value }, "circulating supply updated");
      } catch (err) {
        logger.error({ event: "supply.error", err: String(err) }, "supply update failed");
      }
    },
  };
}
