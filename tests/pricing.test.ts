import { describe, expect, it } from "vitest";
import { asKobo } from "../src/shared/money";
import { computeRetailPrice, PricingError, type PricingRule, type PricingSettings } from "../src/modules/pricing/engine";

const settings: PricingSettings = {
  version: "s1", providerCurrency: "UNIT", fxRate: "20", // 1 provider unit = NGN 20
  defaultMarkup: { type: "percent", bps: 2000 }, roundingIncrementKobo: 1000, roundingMode: "up",
};
const input = { providerCost: 10, country: "england", product: "telegram", operator: "vodafone" }; // cost NGN 200
const rule = (p: Partial<PricingRule> & Pick<PricingRule, "id" | "scope">): PricingRule => ({ version: 1, active: true, ...p });
const price = (rules: PricingRule[] = []) => computeRetailPrice(input, rules, settings, new Date("2026-01-01T00:00:00Z"));

describe("pricing engine", () => {
  it("uses global default: 200 + 20% = NGN 240", () => {
    const s = price();
    expect(s.costKobo).toBe(20_000);
    expect(s.retailKobo).toBe(24_000);
    expect(s.grossMarginKobo).toBe(4_000);
    expect(s.appliedRules.markup).toBeNull();
    expect(s.computedAt).toBe("2026-01-01T00:00:00.000Z");
  });
  it("applies precedence: exact > country+product > product > country", () => {
    const fixed = (n: number) => ({ type: "fixed", kobo: asKobo(n) }) as const;
    const rules = [
      rule({ id: "c", scope: { country: "england" }, markup: fixed(1_000) }),
      rule({ id: "p", scope: { product: "telegram" }, markup: fixed(2_000) }),
      rule({ id: "cp", scope: { country: "england", product: "telegram" }, markup: fixed(3_000) }),
      rule({ id: "cpo", scope: { country: "england", product: "telegram", operator: "vodafone" }, markup: fixed(5_000) }),
    ];
    expect(price(rules).retailKobo).toBe(25_000);
    expect(price(rules.slice(0, 3)).appliedRules.markup?.id).toBe("cp");
    expect(price(rules.slice(0, 2)).appliedRules.markup?.id).toBe("p");
    expect(price(rules.slice(0, 1)).appliedRules.markup?.id).toBe("c");
  });
  it("percent_plus_fixed is additive", () => {
    const s = price([rule({ id: "x", scope: { product: "telegram" }, markup: { type: "percent_plus_fixed", bps: 1000, kobo: asKobo(5_000) } })]);
    expect(s.retailKobo).toBe(27_000); // 20000 + 2000 + 5000
  });
  it("resolves attributes independently (override-less rule inherits markup from broader rule)", () => {
    const s = price([
      rule({ id: "g", scope: { country: "england" }, markup: { type: "fixed", kobo: asKobo(10_000) } }),
      rule({ id: "m", scope: { product: "telegram" }, minPriceKobo: asKobo(50_000) }),
    ]);
    expect(s.retailKobo).toBe(50_000);
    expect(s.appliedRules.markup?.id).toBe("g");
    expect(s.appliedRules.minPrice?.id).toBe("m");
  });
  it("override bypasses rounding but never goes below cost", () => {
    expect(price([rule({ id: "o", scope: { product: "telegram" }, priceOverrideKobo: asKobo(23_333) })]).retailKobo).toBe(23_333);
    expect(() => price([rule({ id: "o", scope: { product: "telegram" }, priceOverrideKobo: asKobo(100) })])).toThrow(PricingError);
  });
  it("most specific sellable flag wins (disable country, re-enable one product)", () => {
    const off = rule({ id: "off", scope: { country: "england" }, sellable: false });
    expect(() => price([off])).toThrowError(/disabled/);
    expect(price([off, rule({ id: "on", scope: { country: "england", product: "telegram" }, sellable: true })]).retailKobo).toBe(24_000);
  });
  it("ignores inactive rules and rejects ambiguous ties", () => {
    const a = rule({ id: "a", scope: { product: "telegram" }, markup: { type: "fixed", kobo: asKobo(1_000) } });
    expect(price([{ ...a, active: false }]).retailKobo).toBe(24_000);
    expect(() => price([a, { ...a, id: "b" }])).toThrowError(/tie/);
  });
  it("rejects unsupported scope shapes", () => {
    expect(() => price([rule({ id: "bad", scope: { operator: "vodafone" }, markup: { type: "fixed", kobo: asKobo(1) } })])).toThrowError(/Unsupported/);
  });
  it("snapshots are immutable values: later rule changes do not alter a prior snapshot", () => {
    const before = price();
    price([rule({ id: "n", scope: { product: "telegram" }, markup: { type: "fixed", kobo: asKobo(99_000) } })]);
    expect(before.retailKobo).toBe(24_000);
  });
});
