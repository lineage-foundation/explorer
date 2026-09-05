export const TOKEN_TICKER = process.env.TOKEN_TICKER ?? "LNGX";
export const TOKEN_DISPLAY_NAME = process.env.TOKEN_DISPLAY_NAME ?? "Lineage";
export const NETWORK_DISPLAY_NAME = process.env.NETWORK_DISPLAY_NAME ?? "Lineage";

// When true, the UI shows a prominent "Testnet" indicator. Set
// NETWORK_IS_TESTNET=true on testnet deployments.
export const IS_TESTNET = (process.env.NETWORK_IS_TESTNET ?? "false") === "true";

// Base URL advertised in the OpenAPI `servers` list. Defaults to same-origin;
// set to the public API origin (e.g. https://explorer.example) once deployed.
export const PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? "/";

// `BigInt("")` is 0n (no throw), so a blank env var — common when a template
// interpolates an unset value — would silently yield a zero coin fraction and
// render every amount as "0". Validate explicitly: empty/unset falls back to the
// default; anything present must be a valid integer of the required sign.
function parseBigIntEnv(
  raw: string | undefined,
  fallback: bigint,
  name: string,
  positive: boolean,
): bigint {
  if (raw === undefined || raw === "") return fallback;
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    throw new Error(`${name} must be an integer, got: ${JSON.stringify(raw)}`);
  }
  if (positive ? value <= 0n : value < 0n) {
    throw new Error(`${name} must be a ${positive ? "positive" : "non-negative"} integer, got: ${raw}`);
  }
  return value;
}

export function getSupplyConstants(): { totalSupply: bigint; coinFraction: bigint } {
  return {
    totalSupply: parseBigIntEnv(process.env.TOKEN_TOTAL_SUPPLY, 0n, "TOKEN_TOTAL_SUPPLY", false),
    coinFraction: parseBigIntEnv(process.env.TOKEN_COIN_FRACTION, 72072000n, "TOKEN_COIN_FRACTION", true),
  };
}
