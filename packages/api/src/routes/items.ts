import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { searchItems } from "@explorer/db";
import { formatLngxPlain } from "@explorer/config";
import { ItemQuery, ItemOutputSchema, listSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";
import { ProblemError } from "../problem.js";

export function registerItems(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/items", tags: ["Items"],
      summary: "Search minted items by metadata substring and/or genesis hash",
      description:
        "Returns item outputs (mints and transfers). Provide `q` for a case-insensitive metadata substring match, `genesis` for an exact item-class filter, or both. At least one is required.",
      request: { query: ItemQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(ItemOutputSchema, "ItemList") } }, description: "A page of item outputs" },
      },
    }),
    async (c) => {
      const { q, genesis, limit, offset } = c.req.valid("query");
      if (q === undefined && genesis === undefined) {
        throw new ProblemError(422, "Invalid request", "Provide at least one of 'q' or 'genesis'.");
      }
      const { items, pagination } = await searchItems(db, { q, genesis, limit, offset });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: items.map((i) => ({
          genesisHash: i.genesisHash,
          metadata: i.metadata,
          address: i.address,
          amount: i.amount,
          amountLngx: i.amount !== null ? formatLngxPlain(i.amount) : null,
          spent: i.spent,
          txHash: i.txHash,
          n: i.n,
          blockNum: i.blockNum,
          blockHash: i.blockHash,
          timestamp: i.timestamp ? i.timestamp.toISOString() : null,
        })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );
}
