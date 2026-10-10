import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database, Swap } from "@explorer/db";
import { getSwaps, getSwapByDruid } from "@explorer/db";
import { formatLngxPlain } from "@explorer/config";
import { PageQuery, TradeSchema, ProblemSchema, listSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";
import { ProblemError } from "../problem.js";

export function serializeTrade(s: Swap) {
  return {
    druid: s.druid,
    participants: s.participants,
    complete: s.complete,
    blockNum: s.blockNum,
    blockHash: s.blockHash,
    timestamp: s.timestamp ? s.timestamp.toISOString() : null,
    legs: s.legs.map((l) => ({
      from: l.from,
      to: l.to,
      txHash: l.txHash,
      met: l.met,
      asset: {
        kind: l.asset.kind,
        amount: l.asset.amount,
        // Only a token amount has an LNGX rendering; an item quantity does not.
        amountLngx: l.asset.kind === "token" ? formatLngxPlain(l.asset.amount) : null,
        genesisHash: l.asset.genesisHash,
        metadata: l.asset.metadata,
      },
    })),
    transactions: s.txHashes,
  };
}

// A DRUID is chosen by the client that built the trade, so it is validated for
// length only: a trade with an unusual DRUID must stay reachable.
const druidParam = z.object({
  druid: z.string().min(1).max(128).openapi({
    param: { name: "druid", in: "path" }, example: "DRUID0x277251e1651aa2861727323acf69a358",
  }),
});

export function registerTrades(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/trades", tags: ["Trades"],
      summary: "List two-way trades, newest settlement first",
      description:
        "A two-way trade is a set of transactions sharing one DRUID that settle together. Each leg states who gave which asset to whom.",
      request: { query: PageQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(TradeSchema, "TradeList") } }, description: "A page of trades" },
      },
    }),
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      const { swaps, pagination } = await getSwaps(db, { limit, offset });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: swaps.map(serializeTrade),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/trades/{druid}", tags: ["Trades"],
      summary: "Get a two-way trade by its DRUID",
      request: { params: druidParam },
      responses: {
        200: { content: { "application/json": { schema: TradeSchema } }, description: "A trade" },
        404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
      },
    }),
    async (c) => {
      const { druid } = c.req.valid("param");
      const found = await getSwapByDruid(db, druid);
      if (!found) throw new ProblemError(404, "Trade not found", `No trade for '${druid}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json(serializeTrade(found.swap), 200);
    },
  );
}
