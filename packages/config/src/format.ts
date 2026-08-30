import BigNumber from "bignumber.js";
import { getSupplyConstants } from "./constants.js";

const FRACTION = new BigNumber(getSupplyConstants().coinFraction.toString());
const FMT = { groupSeparator: ",", groupSize: 3, decimalSeparator: "." } as const;

export function formatLngx(rawAmount: string | null): string {
  if (rawAmount === null) return "0";
  const value = new BigNumber(rawAmount).dividedBy(FRACTION);
  if (!value.isFinite()) return "0";
  return value.toFormat(FMT);
}

export function formatLngxPlain(rawAmount: string | null): string {
  if (rawAmount === null) return "0";
  const value = new BigNumber(rawAmount).dividedBy(FRACTION);
  if (!value.isFinite()) return "0";
  return value.toFixed();
}
