import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { getBlocks, getBlockByHashOrNumber, getBlockTransactions } from "@explorer/db";
import {
  ListQuery, BlockSummarySchema, BlockSchema, BlockTxSchema, ProblemSchema, listSchema,
} from "../schemas.js";
import { CACHE, classifyTxType } from "../helpers.js";
import { ProblemError } from "../problem.js";

const idParam = z.object({ id: z.string().min(1).max(128).openapi({ param: { name: "id", in: "path" }, example: "1" }) });
const problem404 = {
  404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
};

export function registerBlocks(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks", tags: ["Blocks"],
      summary: "List blocks",
      request: { query: ListQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(BlockSummarySchema, "BlockList") } }, description: "A page of blocks" },
      },
    }),
    async (c) => {
      const { limit, offset, order } = c.req.valid("query");
      const { blocks, pagination } = await getBlocks(db, { limit, offset, order });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: blocks.map((b) => ({
          num: b.num, hash: b.hash, previousHash: b.previousHash,
          timestamp: b.timestamp ? b.timestamp.toISOString() : null,
          version: b.version, nbTx: b.nbTx,
        })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks/{id}", tags: ["Blocks"],
      summary: "Get a block by height or hash",
      request: { params: idParam },
      responses: {
        200: { content: { "application/json": { schema: BlockSchema } }, description: "A block" },
        ...problem404,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const b = await getBlockByHashOrNumber(db, id);
      if (!b) throw new ProblemError(404, "Block not found", `No block for '${id}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json({
        num: b.num, hash: b.hash, previousHash: b.previousHash,
        timestamp: b.timestamp ? b.timestamp.toISOString() : null,
        version: b.version, nbTx: b.nbTx,
        merkleRootHash: b.merkleRootHash,
        bits: b.bits !== null ? b.bits.toString() : null,
      }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/blocks/{id}/transactions", tags: ["Blocks"],
      summary: "List a block's transactions",
      request: { params: idParam },
      responses: {
        200: { content: { "application/json": { schema: z.object({ data: z.array(BlockTxSchema) }).openapi("BlockTransactionList") } }, description: "The block's transactions" },
        ...problem404,
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const found = await getBlockTransactions(db, id);
      if (!found) throw new ProblemError(404, "Block not found", `No block for '${id}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json({
        data: found.transactions.map((t) => ({
          hash: t.hash, blockHash: t.blockHash, version: t.version,
          timestamp: t.timestamp ? t.timestamp.toISOString() : null,
          type: classifyTxType(t.txType, t.coinbase),
          coinbase: t.coinbase,
        })),
      }, 200);
    },
  );
}
