import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import type { Database } from "@explorer/db";
import {
  getCirculatingSupply, getMaxBlockNum, getBlocksCount, getTransactionsCount,
} from "@explorer/db";
import { formatLngxPlain, TOKEN_TICKER, NETWORK_DISPLAY_NAME } from "@explorer/config";
import { SupplySchema, StatusSchema } from "../schemas.js";
import { CACHE } from "../helpers.js";
import { SCALAR_LINEAGE_THEME } from "../scalar-theme.js";
import { OPENAPI_INFO } from "../openapi-info.js";

export function registerMeta(app: OpenAPIHono, db: Database): void {
  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/supply", tags: ["Chain"],
      summary: "Circulating and total supply",
      responses: {
        200: { content: { "application/json": { schema: SupplySchema } }, description: "Supply figures" },
      },
    }),
    async (c) => {
      const { circulatingSupply, totalSupply } = await getCirculatingSupply(db);
      c.header("Cache-Control", `public, s-maxage=${CACHE.list}`);
      return c.json({
        circulating: circulatingSupply,
        circulatingLngx: formatLngxPlain(circulatingSupply),
        total: totalSupply,
        totalLngx: totalSupply !== null ? formatLngxPlain(totalSupply) : null,
        ticker: TOKEN_TICKER,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get", path: "/api/v1/status", tags: ["Chain"],
      summary: "Chain and indexer status",
      responses: {
        200: { content: { "application/json": { schema: StatusSchema } }, description: "Chain status" },
      },
    }),
    async (c) => {
      const [height, blocks, transactions] = await Promise.all([
        getMaxBlockNum(db), getBlocksCount(db), getTransactionsCount(db),
      ]);
      c.header("Cache-Control", `public, s-maxage=${CACHE.status}`);
      return c.json({ network: NETWORK_DISPLAY_NAME, ticker: TOKEN_TICKER, height, blocks, transactions });
    },
  );

  app.doc31("/api/v1/openapi.json", OPENAPI_INFO);

  app.get(
    "/api/v1/docs",
    apiReference({
      spec: { url: "/api/v1/openapi.json" },
      // Match the Lineage brand (lineage.foundation) and the explorer app.
      theme: "none",
      forceDarkModeState: "dark",
      hideDarkModeToggle: true,
      withDefaultFonts: false,
      customCss: SCALAR_LINEAGE_THEME,
    }),
  );
}
