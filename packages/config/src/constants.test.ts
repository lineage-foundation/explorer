import { describe, it, expect } from "vitest";
import { TOKEN_TICKER, TOKEN_DISPLAY_NAME, getSupplyConstants } from "./constants.js";

describe("brand constants", () => {
  it("uses the Lineage ticker and name", () => {
    expect(TOKEN_TICKER).toBe("LNGX");
    expect(TOKEN_DISPLAY_NAME).toBe("Lineage");
  });

  it("exposes supply constants as bigints, env-overridable", () => {
    const { totalSupply, coinFraction } = getSupplyConstants();
    expect(typeof totalSupply).toBe("bigint");
    expect(coinFraction).toBeGreaterThan(0n);
  });

  it("falls back to the default coin fraction when the env var is blank", () => {
    withEnv("TOKEN_COIN_FRACTION", "", () => {
      expect(getSupplyConstants().coinFraction).toBe(72072000n);
    });
  });

  it("throws loudly on a zero, negative, or non-integer coin fraction", () => {
    for (const bad of ["0", "-5", "abc"]) {
      withEnv("TOKEN_COIN_FRACTION", bad, () => {
        expect(() => getSupplyConstants()).toThrow(/TOKEN_COIN_FRACTION/);
      });
    }
  });
});

function withEnv(key: string, value: string, fn: () => void): void {
  const prev = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}
