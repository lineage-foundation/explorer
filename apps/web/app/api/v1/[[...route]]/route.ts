import { handle } from "hono/vercel";
import { createApiApp } from "@explorer/api";
import { getDb } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

let handler: ((req: Request) => Response | Promise<Response>) | null = null;

function getHandler(): (req: Request) => Response | Promise<Response> {
  if (!handler) handler = handle(createApiApp({ db: getDb().db }));
  return handler;
}

export function GET(req: Request): Response | Promise<Response> {
  return getHandler()(req);
}

export function OPTIONS(req: Request): Response | Promise<Response> {
  return getHandler()(req);
}
