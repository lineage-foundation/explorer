import { Stat } from "@explorer/ui";
import { TOKEN_TICKER } from "@explorer/config";
import { formatLngx } from "../../lib/format.js";

export function StatRow({
  blocksCount, txCount, circulatingSupply, totalSupply,
}: { blocksCount: number; txCount: number; circulatingSupply: string; totalSupply: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Total blocks" value={blocksCount.toLocaleString()} />
      <Stat label="Transactions" value={txCount.toLocaleString()} />
      <Stat label="Circulating supply" value={formatLngx(circulatingSupply, 2)} unit={TOKEN_TICKER} />
      <Stat label="Total supply" value={totalSupply !== null ? formatLngx(totalSupply, 2) : "—"} unit={totalSupply !== null ? TOKEN_TICKER : undefined} />
    </div>
  );
}
