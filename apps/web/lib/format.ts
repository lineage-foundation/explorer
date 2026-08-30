export { formatLngx } from "@explorer/config";

export function truncateHash(hash: string, lead = 6, tail = 4): string {
  if (hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

export function relativeTime(date: Date | null): string {
  // Epoch 0 is the genesis sentinel (block 0 has timestamp 0), not a real time.
  if (!date || date.getTime() === 0) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function absoluteTime(date: Date | null): string {
  return date && date.getTime() !== 0
    ? date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")
    : "—";
}

export function txTypeLabel(
  valueType: string | undefined,
  coinbase?: boolean,
): "token" | "item" | "coinbase" | "unknown" {
  if (coinbase) return "coinbase";
  if (valueType === "token") return "token";
  if (valueType === "item") return "item";
  return "unknown";
}
