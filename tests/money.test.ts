import { describe, expect, it } from "vitest";
import { applyBps, asKobo, convertToKobo, parseDecimalScaled, providerPriceToMinor, roundToIncrement } from "../src/shared/money";

describe("money", () => {
  it("parses decimals without floats", () => {
    expect(parseDecimalScaled("18.5", 6)).toBe(18_500_000n);
    expect(() => parseDecimalScaled("1.1234567", 6)).toThrow();
    expect(() => parseDecimalScaled("-1", 6)).toThrow();
    expect(() => parseDecimalScaled("abc", 6)).toThrow();
  });
  it("converts provider float cost to minor units, rounding up on excess precision", () => {
    expect(providerPriceToMinor(21)).toBe(2100);
    expect(providerPriceToMinor(0.29)).toBe(29); // 0.29*100 = 28.999999999999996
    expect(providerPriceToMinor(0.015)).toBe(2);
  });
  it("converts to kobo (units cancel) and rounds cost up", () => {
    expect(convertToKobo(2100, "18.5")).toBe(38_850); // 21 units * 18.5 NGN = 388.50 NGN
    expect(convertToKobo(1, "0.333333")).toBe(1);
    expect(() => convertToKobo(100, "0")).toThrow();
  });
  it("applies bps half-up with bigint safety", () => {
    expect(applyBps(asKobo(1000), 2500)).toBe(250);
    expect(applyBps(asKobo(1), 5000)).toBe(1); // 0.5 -> 1
    expect(applyBps(asKobo(9_000_000_000_000), 9999)).toBe(8_999_100_000_000);
  });
  it("rounds to increments", () => {
    expect(roundToIncrement(asKobo(40_001), 1000, "up")).toBe(41_000);
    expect(roundToIncrement(asKobo(40_499), 1000, "nearest")).toBe(40_000);
    expect(roundToIncrement(asKobo(40_500), 1000, "nearest")).toBe(41_000);
    expect(roundToIncrement(asKobo(40_999), 1000, "down")).toBe(40_000);
  });
});
