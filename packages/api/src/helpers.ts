export const CACHE = { resource: 3600, list: 10, status: 5 } as const;

export function classifyTxType(
  valueType: string | undefined,
  coinbase: boolean,
): "token" | "item" | "coinbase" | "unknown" {
  if (coinbase) return "coinbase";
  if (valueType === "token") return "token";
  if (valueType === "item") return "item";
  return "unknown";
}
