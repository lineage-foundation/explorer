import { NextResponse } from "next/server";
import { getBlocksCount } from "@explorer/db";
import { getDb } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ status: "ok", db: "unconfigured" });
  }
  try {
    // Reuse the shared connection pool rather than opening and tearing down a
    // fresh one on every (frequently polled) health check.
    const { db } = getDb();
    const blocks = await getBlocksCount(db);
    return NextResponse.json({ status: "ok", db: "up", blocks });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
