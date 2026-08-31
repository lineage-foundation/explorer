import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { resolveSearch } from "../../../lib/resolve-search.js";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const { db } = getDb();
    const suggestions = await resolveSearch(db, q);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
