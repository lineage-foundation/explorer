import { describe, it, expect } from "vitest";
import { truncateHash, formatLngx, txTypeLabel, relativeTime, absoluteTime, confirmations } from "../format.js";

describe("format", () => {
  it("truncates a hash keeping lead and tail", () => {
    expect(truncateHash("g7f3c2a8aaaa4d0e91ac", 6, 4)).toBe("g7f3c2…91ac");
    expect(truncateHash("short")).toBe("short");
  });
  it("formats a raw amount as LNGX by dividing by 72072000", () => {
    // 500 LNGX in raw units:
    expect(formatLngx((500n * 72072000n).toString())).toBe("500");
    expect(formatLngx((BigInt(72072000) / 2n).toString())).toBe("0.5");
    expect(formatLngx(null)).toBe("0");
  });
  it("keeps precision for very large amounts (beyond JS safe integer)", () => {
    const raw = (1250000000n * 72072000n).toString(); // 1.25B LNGX
    expect(formatLngx(raw)).toBe("1,250,000,000");
  });
  it("labels tx type", () => {
    expect(txTypeLabel("token", false)).toBe("token");
    expect(txTypeLabel("item", false)).toBe("item");
    expect(txTypeLabel("token", true)).toBe("coinbase");
    expect(txTypeLabel(undefined, false)).toBe("unknown");
  });
  it("relativeTime returns a short bucket", () => {
    expect(relativeTime(null)).toBe("—");
    const d = new Date(Date.now() - 5000);
    expect(relativeTime(d)).toMatch(/s ago$/);
  });
  it("treats the genesis epoch-0 timestamp as unset", () => {
    expect(relativeTime(new Date(0))).toBe("—");
    expect(absoluteTime(new Date(0))).toBe("—");
  });
  it("computes confirmations as tip - height + 1 (inclusion = 1)", () => {
    expect(confirmations(10, 10)).toBe(1); // latest block
    expect(confirmations(10, 5)).toBe(6);
    expect(confirmations(10, 0)).toBe(11); // genesis, tip 10
    expect(confirmations(null, 3)).toBe(0); // no tip
    expect(confirmations(5, 10)).toBe(0); // impossible height > tip, clamped
  });
});
