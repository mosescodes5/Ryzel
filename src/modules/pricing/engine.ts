import {
  addKobo, applyBps, asKobo, convertToKobo, providerPriceToMinor, roundToIncrement,
  type Kobo, type RoundingMode,
} from "../../shared/money";

/**
 * Rule precedence (most specific wins), resolved PER ATTRIBUTE (markup, override, min price, sellable):
 *   4  country + product + operator
 *   3  country + product
 *   2  product
 *   1  country
 *   0  global settings
 * Allowed scope shapes only; anything else (operator alone, country+operator) is rejected.
 * A rule carries ONE markup type, so "percent + fixed" is explicit (`percent_plus_fixed`, additive).
 * Percent markup is a percentage of provider cost converted to NGN.
 */
export interface Scope { country?: string; product?: string; operator?: string }

export type Markup =
  | { type: "percent"; bps: number }
  | { type: "fixed"; kobo: Kobo }
  | { type: "percent_plus_fixed"; bps: number; kobo: Kobo };

export interface PricingRule {
  id: string;
  version: number;
  scope: Scope;
  active: boolean;
  markup?: Markup;
  /** Exact retail price. Still rejected if below cost. Bypasses rounding and min price. */
  priceOverrideKobo?: Kobo;
  minPriceKobo?: Kobo;
  sellable?: boolean;
}

export interface PricingSettings {
  version: string;
  providerCurrency: string;
  /** NGN per 1 provider currency unit, decimal string (<= 6 dp). */
  fxRate: string;
  defaultMarkup: Markup;
  defaultMinPriceKobo?: Kobo;
  roundingIncrementKobo: number;
  roundingMode: RoundingMode;
}

export interface RuleRef { id: string; version: number }

export interface PriceSnapshot {
  providerCostMinor: number;
  providerCurrency: string;
  fxRate: string;
  costKobo: Kobo;
  markup: Markup;
  retailKobo: Kobo;
  grossMarginKobo: Kobo;
  appliedRules: { markup: RuleRef | null; override: RuleRef | null; minPrice: RuleRef | null; sellable: RuleRef | null };
  settingsVersion: string;
  computedAt: string;
}

export type PricingErrorCode = "NOT_SELLABLE" | "BELOW_COST" | "AMBIGUOUS_RULES" | "INVALID_RULE";
export class PricingError extends Error {
  constructor(readonly code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export function scopeSpecificity(s: Scope): number {
  const { country: c, product: p, operator: o } = s;
  if (c && p && o) return 4;
  if (c && p && !o) return 3;
  if (p && !c && !o) return 2;
  if (c && !p && !o) return 1;
  throw new PricingError("INVALID_RULE", `Unsupported rule scope: ${JSON.stringify(s)}`);
}

function matches(rule: PricingRule, q: Required<Scope>): boolean {
  const s = rule.scope;
  return (!s.country || s.country === q.country) && (!s.product || s.product === q.product) && (!s.operator || s.operator === q.operator);
}

function pick<T>(
  rules: PricingRule[], q: Required<Scope>, read: (r: PricingRule) => T | undefined,
): { value: T; rule: PricingRule } | null {
  let best: { value: T; rule: PricingRule; spec: number } | null = null;
  for (const r of rules) {
    if (!r.active || !matches(r, q)) continue;
    const v = read(r);
    if (v === undefined) continue;
    const spec = scopeSpecificity(r.scope);
    if (best && spec === best.spec) {
      throw new PricingError("AMBIGUOUS_RULES", `Rules ${best.rule.id} and ${r.id} tie at specificity ${spec}`);
    }
    if (!best || spec > best.spec) best = { value: v, rule: r, spec };
  }
  return best && { value: best.value, rule: best.rule };
}

const ref = (r: PricingRule): RuleRef => ({ id: r.id, version: r.version });

function markupAmount(m: Markup, costKobo: Kobo): Kobo {
  switch (m.type) {
    case "percent": return applyBps(costKobo, m.bps);
    case "fixed": return m.kobo;
    case "percent_plus_fixed": return addKobo(applyBps(costKobo, m.bps), m.kobo);
  }
}

export function computeRetailPrice(
  input: { providerCost: number; country: string; product: string; operator: string },
  rules: PricingRule[], settings: PricingSettings, now: Date = new Date(),
): PriceSnapshot {
  const q = { country: input.country, product: input.product, operator: input.operator };

  const sellable = pick(rules, q, (r) => r.sellable);
  if (sellable && sellable.value === false) {
    throw new PricingError("NOT_SELLABLE", `${q.product}/${q.country}/${q.operator} is disabled by rule ${sellable.rule.id}`);
  }

  const providerCostMinor = providerPriceToMinor(input.providerCost);
  const costKobo = convertToKobo(providerCostMinor, settings.fxRate);

  const override = pick(rules, q, (r) => r.priceOverrideKobo);
  const markupPick = pick(rules, q, (r) => r.markup);
  const minPick = pick(rules, q, (r) => r.minPriceKobo);
  const markup = markupPick?.value ?? settings.defaultMarkup;

  let retail: Kobo;
  if (override) {
    retail = override.value;
  } else {
    const marked = addKobo(costKobo, markupAmount(markup, costKobo));
    const floor = minPick?.value ?? settings.defaultMinPriceKobo ?? asKobo(0);
    retail = roundToIncrement(asKobo(Math.max(marked, floor)), settings.roundingIncrementKobo, settings.roundingMode);
  }

  if (retail < costKobo) {
    throw new PricingError("BELOW_COST", `Retail ${retail} kobo is below cost ${costKobo} kobo`);
  }

  return {
    providerCostMinor,
    providerCurrency: settings.providerCurrency,
    fxRate: settings.fxRate,
    costKobo,
    markup,
    retailKobo: retail,
    grossMarginKobo: asKobo(retail - costKobo),
    appliedRules: {
      markup: markupPick ? ref(markupPick.rule) : null,
      override: override ? ref(override.rule) : null,
      minPrice: minPick ? ref(minPick.rule) : null,
      sellable: sellable ? ref(sellable.rule) : null,
    },
    settingsVersion: settings.version,
    computedAt: now.toISOString(),
  };
}
