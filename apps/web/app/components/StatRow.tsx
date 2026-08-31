import { Stat } from "@explorer/ui";
import { TOKEN_TICKER } from "@explorer/config";
import { formatLngx } from "../../lib/format.js";

export function StatRow({
  blocksCount, txCount, circulatingSupply,
}: { blocksCount: number; txCount: number; circulatingSupply: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label="Total blocks" value={blocksCount.toLocaleString()} />
      <Stat label="Transactions" value={txCount.toLocaleString()} />
      <Stat label="Circulating supply" value={formatLngx(circulatingSupply, 2)} unit={TOKEN_TICKER} />
    </div>
  );
}
