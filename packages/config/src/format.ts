import BigNumber from "bignumber.js";
import { getSupplyConstants } from "./constants.js";

const FRACTION = new BigNumber(getSupplyConstants().coinFraction.toString());
const FMT = { groupSeparator: ",", groupSize: 3, decimalSeparator: "." } as const;
// dividing by the coin fraction is non-terminating for most amounts, so without
// a bound BigNumber falls back to its global 20-decimal default and renders
// balances like "1.38750138750138750139". Cap the default precision at roughly
// single raw-unit granularity (1 raw ≈ 1.4e-8 LNGX); trailing zeros are trimmed,
// so exact values like "500" stay clean. An explicit `decimals` still wins.
const DEFAULT_DECIMALS = 8;

export function formatLngx(rawAmount: string | null, decimals?: number): string {
  if (rawAmount === null) return "0";
  const value = new BigNumber(rawAmount).dividedBy(FRACTION);
  if (!value.isFinite()) return "0";
  if (decimals !== undefined) return value.toFormat(decimals, FMT);
  return value.decimalPlaces(DEFAULT_DECIMALS).toFormat(FMT);
}

export function formatLngxPlain(rawAmount: string | null): string {
  if (rawAmount === null) return "0";
  const value = new BigNumber(rawAmount).dividedBy(FRACTION);
  if (!value.isFinite()) return "0";
  return value.decimalPlaces(DEFAULT_DECIMALS).toFixed();
}
