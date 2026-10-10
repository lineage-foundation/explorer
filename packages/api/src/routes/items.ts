import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { getItem, getItemHolders, getItemTransfers, searchItems } from "@explorer/db";
import {
  ItemQuery, ItemOutputSchema, ItemSchema, ItemTransferSchema, PageQuery, ProblemSchema, listSchema,
} from "../schemas.js";
import { CACHE } from "../helpers.js";
import { ProblemError } from "../problem.js";

const genesisParam = z.object({
  genesis: z.string().min(1).max(128).openapi({
    param: { name: "genesis", in: "path" }, example: "g42df520fb2b94f34af5615babcfef2e",
  }),
});

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
      const { q, genesis, spent, limit, offset } = c.req.valid("query");
      if (q === undefined && genesis === undefined) {
        throw new ProblemError(422, "Invalid request", "Provide at least one of 'q' or 'genesis'.");
      }
      const { items, pagination } = await searchItems(db, {
        q, genesis, limit, offset, spent: spent === undefined ? undefined : spent === "true",
      });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: items.map((i) => ({
          genesisHash: i.genesisHash,
          metadata: i.metadata,
          address: i.address,
          amount: i.amount,
          amountLngx: null,
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

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/items/{genesis}", tags: ["Items"],
      summary: "Get an item by its genesis hash",
      description: "An item is identified by the hash of the transaction that created it. Returns its creation facts and current holders.",
      request: { params: genesisParam },
      responses: {
        200: { content: { "application/json": { schema: ItemSchema } }, description: "An item" },
        404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
      },
    }),
    async (c) => {
      const { genesis } = c.req.valid("param");
      const [item, { holders }] = await Promise.all([
        getItem(db, genesis),
        getItemHolders(db, genesis, { limit: 100 }),
      ]);
      if (!item) throw new ProblemError(404, "Item not found", `No item for '${genesis}'`);
      // Holders change as the item moves, so this is cached like a list.
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        ...item,
        timestamp: item.timestamp ? item.timestamp.toISOString() : null,
        holders,
      }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/items/{genesis}/transfers", tags: ["Items"],
      summary: "List the transactions that moved an item, newest first",
      request: { params: genesisParam, query: PageQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(ItemTransferSchema, "ItemTransferList") } }, description: "A page of transfers" },
      },
    }),
    async (c) => {
      const { genesis } = c.req.valid("param");
      const { limit, offset } = c.req.valid("query");
      const { transfers, pagination } = await getItemTransfers(db, genesis, { limit, offset });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: transfers.map((t) => ({ ...t, timestamp: t.timestamp ? t.timestamp.toISOString() : null })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );
}
