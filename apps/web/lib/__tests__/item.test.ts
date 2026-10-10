import { describe, it, expect } from "vitest";
import { itemHref, metadataPreview, metadataRows, transferMoved } from "../item.js";

describe("metadataRows", () => {
  it("turns a JSON object into key/value rows, keeping key order", () => {
    expect(metadataRows('{"title":"Alpha","n":3,"ok":true,"tags":["a"],"o":{"x":1},"z":null}')).toEqual([
      { key: "title", value: "Alpha" }, { key: "n", value: "3" }, { key: "ok", value: "true" },
      { key: "tags", value: '["a"]' }, { key: "o", value: '{"x":1}' }, { key: "z", value: "null" },
    ]);
  });
  it.each([null, "", "   ", "not json", "[1,2]", '"str"', "42", "null", "true", "{broken", "{}"])(
    "is null for %j (not a non-empty JSON object)", (m) => {
      expect(metadataRows(m)).toBeNull();
    });
  it("keeps markup-looking values as plain strings", () => {
    expect(metadataRows('{"x":"<img src=x onerror=alert(1)>"}')).toEqual([{ key: "x", value: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("metadataPreview", () => {
  it("is a dash when there is no metadata", () => {
    expect(metadataPreview(null)).toBe("—");
    expect(metadataPreview("")).toBe("—");
    expect(metadataPreview("  \n ")).toBe("—");
  });
  it("summarises a JSON object as key: value pairs", () => {
    expect(metadataPreview('{"edition":"Alpha","medium":"digital"}')).toBe("edition: Alpha · medium: digital");
  });
  it("leads with the title or name, wherever it sits in the object", () => {
    expect(metadataPreview('{"collection":"Moiré","hash":"951a","title":"Phase 0"}')).toBe("Phase 0 · collection: Moiré · hash: 951a");
    expect(metadataPreview('{"medium":"digital","Name":"Beta"}')).toBe("Beta · medium: digital");
    expect(metadataPreview('{"title":"  ","medium":"digital"}')).toBe("title: · medium: digital");
  });
  it("collapses whitespace in raw text", () => {
    expect(metadataPreview("line one\n  line two")).toBe("line one line two");
  });
  it("truncates to the limit with an ellipsis", () => {
    expect(metadataPreview("x".repeat(200), 10)).toBe("xxxxxxxxx…");
    expect(metadataPreview("x".repeat(200))).toHaveLength(80);
    expect(metadataPreview("short", 10)).toBe("short");
  });
});

describe("itemHref", () => {
  it("URL-encodes the genesis hash", () => {
    expect(itemHref("g42df")).toBe("/item/g42df");
    expect(itemHref("g12/3 4")).toBe("/item/g12%2F3%204");
  });
});

describe("transferMoved", () => {
  const out = (address: string | null, amount: string) => ({ address, amount });

  it("excludes what the sender kept from the recipients and the quantity", () => {
    // A sends 2 to B and keeps 1.
    expect(transferMoved({ from: ["A"], to: [out("B", "2"), out("A", "1")], created: false }))
      .toEqual({ recipients: ["B"], quantity: "2" });
  });
  it("lists each recipient once and sums their outputs", () => {
    expect(transferMoved({ from: ["A"], to: [out("B", "1"), out("B", "1"), out("C", "3")], created: false }))
      .toEqual({ recipients: ["B", "C"], quantity: "5" });
  });
  it("counts every output for the create transaction", () => {
    expect(transferMoved({ from: [], to: [out("A", "3")], created: true })).toEqual({ recipients: ["A"], quantity: "3" });
  });
  it("counts every output when the sender is unknown", () => {
    expect(transferMoved({ from: [], to: [out("B", "2")], created: false })).toEqual({ recipients: ["B"], quantity: "2" });
  });
  it("shows a transfer entirely back to the sender as such, not as nothing", () => {
    expect(transferMoved({ from: ["A"], to: [out("A", "2"), out("A", "1")], created: false }))
      .toEqual({ recipients: ["A"], quantity: "3" });
  });
  it("ignores outputs with no address as recipients and malformed amounts in the sum", () => {
    expect(transferMoved({ from: ["A"], to: [out(null, "2"), out("B", "x")], created: false }))
      .toEqual({ recipients: ["B"], quantity: "2" });
  });
});
