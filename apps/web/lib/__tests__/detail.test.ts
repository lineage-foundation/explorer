import { describe, it, expect } from "vitest";
import { decodeUnicorn, scriptStack, groupDigits, bigintReplacer } from "../detail.js";

describe("decodeUnicorn", () => {
  it("splits the decoded seed into seed and witness on the first dash", () => {
    // "hi-wit" as char codes
    expect(decodeUnicorn([104, 105, 45, 119, 105, 116])).toEqual({ seed: "hi", witness: "wit" });
  });
  it("keeps later dashes in the witness", () => {
    expect(decodeUnicorn([97, 45, 98, 45, 99])).toEqual({ seed: "a", witness: "b-c" });
  });
  it("returns an empty witness when there is no dash", () => {
    expect(decodeUnicorn([97, 98])).toEqual({ seed: "ab", witness: "" });
  });
  it("returns null for absent or non-numeric seeds", () => {
    expect(decodeUnicorn(null)).toBeNull();
    expect(decodeUnicorn([])).toBeNull();
    expect(decodeUnicorn(["x"])).toBeNull();
  });
});

describe("scriptStack", () => {
  it("surfaces each single-key stack entry as {type, value}", () => {
    expect(scriptStack({ stack: [{ Bytes: "deadbeef" }, { Op: 5 }] })).toEqual([
      { type: "Bytes", value: "deadbeef" },
      { type: "Op", value: "5" },
    ]);
  });
  it("returns [] for a missing or malformed signature", () => {
    expect(scriptStack(null)).toEqual([]);
    expect(scriptStack({})).toEqual([]);
    expect(scriptStack({ stack: "nope" })).toEqual([]);
  });
});

describe("groupDigits", () => {
  it("inserts thousands separators", () => {
    expect(groupDigits("2590170407")).toBe("2,590,170,407");
    expect(groupDigits("100")).toBe("100");
    expect(groupDigits("0")).toBe("0");
  });
});

describe("bigintReplacer", () => {
  it("serialises bigint values as strings", () => {
    expect(JSON.stringify({ bits: 486604799n }, bigintReplacer)).toBe('{"bits":"486604799"}');
  });
});
