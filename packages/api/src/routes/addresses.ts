import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AccountTx, Database } from "@explorer/db";
import { getAccountBalance, getAccountTransactions } from "@explorer/db";
import { formatLngxPlain } from "@explorer/config";
import { AccountTxQuery, AddressSchema, AddressTransactionSchema, listSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";
import { serializeTransaction } from "./transactions.js";

function serializeAccountTransaction(t: AccountTx) {
  return {
    ...serializeTransaction(t),
    blockNum: t.blockNum,
    balanceAfter: t.balanceAfter,
    balanceAfterLngx: formatLngxPlain(t.balanceAfter),
  };
}

const addressParam = z.object({
  address: z.string().min(1).max(128).openapi({ param: { name: "address", in: "path" }, example: "addr_1" }),
});

export function registerAddresses(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/addresses/{address}", tags: ["Addresses"],
      summary: "Get an address balance",
      request: { params: addressParam },
      responses: {
        200: { content: { "application/json": { schema: AddressSchema } }, description: "The address balance" },
      },
    }),
    async (c) => {
      const { address } = c.req.valid("param");
      const { balance } = await getAccountBalance(db, address);
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({ address, balance, balanceLngx: formatLngxPlain(balance) });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/addresses/{address}/transactions", tags: ["Addresses"],
      summary: "List an address's transactions",
      request: { params: addressParam, query: AccountTxQuery },
      responses: {
        200: { content: { "application/json": { schema: listSchema(AddressTransactionSchema, "AddressTransactionList") } }, description: "A page of the address's transactions" },
      },
    }),
    async (c) => {
      const { address } = c.req.valid("param");
      const { limit, offset } = c.req.valid("query");
      const { transactions, pagination } = await getAccountTransactions(db, address, { limit, offset });
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        data: transactions.map(serializeAccountTransaction),
        pagination: { ...pagination, hasMore: pagination.hasMore ?? false },
      });
    },
  );
}
