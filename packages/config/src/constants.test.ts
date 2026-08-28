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
});
