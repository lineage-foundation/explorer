import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { Database } from "@explorer/db";
import { ProblemError, problemJson } from "./problem.js";
import { rateLimit, type RateLimitOptions } from "./rate-limit.js";
import { registerBlocks } from "./routes/blocks.js";
import { registerTransactions } from "./routes/transactions.js";
import { registerAddresses } from "./routes/addresses.js";
import { registerMeta } from "./routes/meta.js";

export interface ApiDeps {
  db: Database;
  rateLimit?: RateLimitOptions;
}

export function createApiApp({ db, rateLimit: rl }: ApiDeps): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        const detail = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new ProblemError(422, "Invalid request", detail);
      }
    },
  });

  app.use("/api/v1/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));
  app.use("/api/v1/*", rateLimit(rl));

  app.onError((err, c) => {
    if (err instanceof ProblemError) {
      return problemJson(c, err.status, err.title, err.detail);
    }
    console.error(err);
    return problemJson(c, 500, "Internal Server Error");
  });

  app.notFound((c) => problemJson(c, 404, "Not Found", `No route for ${new URL(c.req.url).pathname}`));

  registerBlocks(app, db);
  registerTransactions(app, db);
  registerAddresses(app, db);
  registerMeta(app, db);

  return app;
}
