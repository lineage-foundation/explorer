import { NextResponse } from "next/server";
import {
  getBlocks, getTransactions, getBlocksCount, getTransactionsCount, getCirculatingSupply,
} from "@explorer/db";
import { getDb } from "../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { db } = getDb();
  const [{ blocks }, { transactions }, blocksCount, txCount, supply] = await Promise.all([
    getBlocks(db, { limit: 6 }),
    getTransactions(db, { limit: 6 }),
    getBlocksCount(db),
    getTransactionsCount(db),
    getCirculatingSupply(db),
  ]);
  return NextResponse.json({
    blocks, txs: transactions, blocksCount, txCount, circulatingSupply: supply.circulatingSupply,
  });
}
