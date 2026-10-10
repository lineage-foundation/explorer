import Link from "next/link";
import { truncateHash } from "../../lib/format.js";
import { itemHref } from "../../lib/item.js";

// An item, shown by its (truncated) genesis hash and linking to its page.
export function ItemLink({ genesis, className }: { genesis: string; className?: string }) {
  return (
    <Link href={itemHref(genesis)} className={className ?? "font-mono text-xs text-link hover:text-link-hover"}>
      {truncateHash(genesis, 8, 6)}
    </Link>
  );
}
