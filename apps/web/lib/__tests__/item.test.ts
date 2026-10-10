import { describe, it, expect } from "vitest";
import { itemHref, metadataPreview, metadataRows } from "../item.js";

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
    expect(metadataPreview('{"title":"Alpha","medium":"digital"}')).toBe("title: Alpha · medium: digital");
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
