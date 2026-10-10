import {
  getBlocks, getActivity, getBlocksCount, getTransactionsCount, getCirculatingSupply,
} from "@explorer/db";
import { getDb } from "../lib/db.js";
import { HOME_FEED_LIMIT } from "../lib/home.js";
import { LatestFeed } from "./components/LatestFeed.js";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { db } = getDb();
  const [{ blocks }, { items }, blocksCount, txCount, supply] = await Promise.all([
    getBlocks(db, { limit: HOME_FEED_LIMIT }),
    getActivity(db, { limit: HOME_FEED_LIMIT }),
    getBlocksCount(db),
    getTransactionsCount(db),
    getCirculatingSupply(db),
  ]);
  return (
    <LatestFeed
      initial={{
        blocks, txs: items, blocksCount, txCount,
        circulatingSupply: supply.circulatingSupply, totalSupply: supply.totalSupply,
      }}
    />
  );
}
