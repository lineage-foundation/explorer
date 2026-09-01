import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Database, TxDetail } from "@explorer/db";
import { getTransactions, getTransactionByHash } from "@explorer/db";
import { formatLngxPlain } from "@explorer/config";
import {
  ListQuery, TransactionSummarySchema, TransactionSchema, ProblemSchema, listSchema,
} from "../schemas.js";
import { CACHE, classifyTxType } from "../helpers.js";
import { ProblemError } from "../problem.js";

export function serializeTransaction(t: TxDetail) {
  return {
    hash: t.hash,
    blockHash: t.blockHash,
    version: t.version,
    timestamp: t.timestamp ? t.timestamp.toISOString() : null,
    type: classifyTxType(t.outs[0]?.valueType, t.coinbase),
    inputs: t.ins.map((i) => ({
      fromAddress: i.fromAddress,
      amount: i.amount,
      amountLngx: i.amount !== null ? formatLngxPlain(i.amount) : null,
      previousOutTxHash: i.previousOutTxHash,
      previousOutTxN: i.previousOutTxN,
    })),
    outputs: t.outs.map((o) => ({
      n: o.n,
      valueType: o.valueType,
      amount: o.amount,
      amountLngx: o.amount !== null ? formatLngxPlain(o.amount) : null,
      address: o.scriptPublicKey,
      locktime: o.locktime,
      genesisHash: o.genesisHash,
      itemMetadata: o.itemMetadata,
    })),
  };
}

const hashParam = z.object({
  hash: z.string().min(1).max(128).openapi({ param: { name: "hash", in: "path" }, example: "tx_2" }),
});

export function registerTransactions(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/transactions", tags: ["Transactions"],
      summary: "List transactions (excludes coinbase)",
      request: { query: ListQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(TransactionSummarySchema, "TransactionList") } }, description: "A page of transactions" },
      },
    }),
    async (c) => {
      const { limit, offset, order } = c.req.valid("query");
      const { transactions, pagination } = await getTransactions(db, { limit, offset, order });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: transactions.map((t) => ({
          hash: t.hash, blockHash: t.blockHash, version: t.version,
          timestamp: t.timestamp ? t.timestamp.toISOString() : null,
          type: classifyTxType(t.txType, false),
        })),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/transactions/{hash}", tags: ["Transactions"],
      summary: "Get a transaction by hash",
      request: { params: hashParam },
      responses: {
        200: { content: { "application/json": { schema: TransactionSchema } }, description: "A transaction" },
        404: { content: { "application/problem+json": { schema: ProblemSchema } }, description: "Not found" },
      },
    }),
    async (c) => {
      const { hash } = c.req.valid("param");
      const tx = await getTransactionByHash(db, hash);
      if (!tx) throw new ProblemError(404, "Transaction not found", `No transaction for '${hash}'`);
      c.header("Cache-Control", `public, s-maxage=${CACHE.resource}`);
      return c.json(serializeTransaction(tx), 200);
    },
  );
}
