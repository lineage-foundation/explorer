import { NextResponse } from "next/server";
import { createDb, getBlocksCount } from "@explorer/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ status: "ok", db: "unconfigured" });
  }
  const { db, close } = createDb(url);
  try {
    const blocks = await getBlocksCount(db);
    return NextResponse.json({ status: "ok", db: "up", blocks });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  } finally {
    await close();
  }
}
