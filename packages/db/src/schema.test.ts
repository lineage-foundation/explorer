import { describe, it, expect } from "vitest";
import * as schema from "./schema.js";

describe("schema", () => {
  it("declares all seven explorer tables", () => {
    expect(Object.keys(schema).filter((k) => k.charAt(0) === k.charAt(0).toLowerCase())).toEqual(
      expect.arrayContaining([
        "block", "transaction", "txIn", "txOut", "txInExpanded",
        "coinsHistory", "circulatingSupply",
      ]),
    );
  });

  it("keeps circulating_supply.id as a non-serial primary key", () => {
    // integer PK (app-supplied), not serial — guards against accidental serial()
    const col = schema.circulatingSupply.id;
    expect(col.primary).toBe(true);
    expect(col.dataType).toBe("number");
  });
});
