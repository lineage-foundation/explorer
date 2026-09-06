import { OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "@explorer/db";
import { registerBlocks } from "./routes/blocks.js";
import { registerTransactions } from "./routes/transactions.js";
import { registerAddresses } from "./routes/addresses.js";
import { registerItems } from "./routes/items.js";
import { registerMeta } from "./routes/meta.js";
import { OPENAPI_INFO } from "./openapi-info.js";

/**
 * Build the OpenAPI 3.1 document from the route definitions, in-process and
 * without a database or network. Route registration only records each route's
 * schema — the handlers (which close over `db`) are never invoked here — so a
 * placeholder db is safe. This lets the web app render a branded docs page from
 * the exact same spec it serves at /api/v1/openapi.json.
 */
export function getOpenApiDocument(): Record<string, unknown> {
  const app = new OpenAPIHono();
  const db = {} as Database;
  registerBlocks(app, db);
  registerTransactions(app, db);
  registerAddresses(app, db);
  registerItems(app, db);
  registerMeta(app, db);
  return app.getOpenAPI31Document(OPENAPI_INFO) as unknown as Record<string, unknown>;
}
