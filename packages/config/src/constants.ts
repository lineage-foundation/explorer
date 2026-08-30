export const TOKEN_TICKER = process.env.TOKEN_TICKER ?? "LNGX";
export const TOKEN_DISPLAY_NAME = process.env.TOKEN_DISPLAY_NAME ?? "Lineage";
export const NETWORK_DISPLAY_NAME = process.env.NETWORK_DISPLAY_NAME ?? "Lineage";

// Base URL advertised in the OpenAPI `servers` list. Defaults to same-origin;
// set to the public API origin (e.g. https://explorer.example) once deployed.
export const PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? "/";

export function getSupplyConstants(): { totalSupply: bigint; coinFraction: bigint } {
  return {
    totalSupply: BigInt(process.env.TOKEN_TOTAL_SUPPLY ?? "0"),
    coinFraction: BigInt(process.env.TOKEN_COIN_FRACTION ?? "72072000"),
  };
}
