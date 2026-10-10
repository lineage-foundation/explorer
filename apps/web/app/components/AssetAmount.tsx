import Link from "next/link";
import type { SwapAsset } from "@explorer/db";
import { Mono, Tag } from "@explorer/ui";
import { TOKEN_TICKER } from "@explorer/config";
import { formatLngx, truncateHash } from "../../lib/format.js";

// A token amount in LNGX, or an item as an item: its quantity and a link to the
// transaction that created it. An item quantity is never shown as LNGX.
export function AssetAmount({ asset }: { asset: SwapAsset }) {
  if (asset.kind === "token") {
    return <Mono className="text-xs">{`${formatLngx(asset.amount)} ${TOKEN_TICKER}`}</Mono>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Tag>item</Tag>
      <Mono className="text-xs">{`× ${asset.amount}`}</Mono>
      {asset.genesisHash && (
        <Link href={`/transaction/${asset.genesisHash}`} className="font-mono text-[0.6rem] text-link hover:text-link-hover">
          {truncateHash(asset.genesisHash, 8, 6)}
        </Link>
      )}
    </span>
  );
}
