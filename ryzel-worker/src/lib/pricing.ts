import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { siteSettings } from "../db/schema";
import type { AppSettings } from "./config";

export interface PricingTier {
  maxCostNgn: number | null;
  markupPercent: number;
  markupFlatNgn: number;
}

const SCALAR_KEYS = ["usd_ngn_rate", "min_price_ngn"] as const;
const TIERS_KEY = "pricing_tiers";

export function defaultTiers(settings: AppSettings): PricingTier[] {
  return [
    {
      maxCostNgn: null,
      markupPercent: settings.markupPercent,
      markupFlatNgn: settings.markupFlatNgn,
    },
  ];
}

function normalizeTier(raw: any): PricingTier {
  const maxCost = raw?.max_cost_ngn ?? raw?.maxCostNgn;
  return {
    maxCostNgn: maxCost === null || maxCost === undefined || maxCost === "" ? null : Number(maxCost),
    markupPercent: Number(raw?.markup_percent ?? raw?.markupPercent ?? 0),
    markupFlatNgn: Number(raw?.markup_flat_ngn ?? raw?.markupFlatNgn ?? 0),
  };
}

export async function getPricingTiers(db: Db | null, settings: AppSettings): Promise<PricingTier[]> {
  if (!db) return defaultTiers(settings);
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, TIERS_KEY) });
  if (!row || !row.value) return defaultTiers(settings);
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultTiers(settings);
    return parsed.map(normalizeTier);
  } catch {
    return defaultTiers(settings);
  }
}

export interface PricingConfig {
  usdNgnRate: number;
  minPriceNgn: number;
  tiers: PricingTier[];
}

export async function getPricingConfig(db: Db | null, settings: AppSettings): Promise<PricingConfig> {
  const scalars = {
    usd_ngn_rate: settings.usdNgnRate,
    min_price_ngn: settings.minPriceNgn,
  } as Record<string, number>;

  if (!db) {
    return { usdNgnRate: scalars.usd_ngn_rate, minPriceNgn: scalars.min_price_ngn, tiers: defaultTiers(settings) };
  }

  const rows = await db.query.siteSettings.findMany({
    where: inArray(siteSettings.key, [...SCALAR_KEYS]),
  });
  for (const row of rows) {
    const parsed = parseFloat(row.value);
    if (!Number.isNaN(parsed)) scalars[row.key] = parsed;
  }

  return {
    usdNgnRate: scalars.usd_ngn_rate,
    minPriceNgn: scalars.min_price_ngn,
    tiers: await getPricingTiers(db, settings),
  };
}

export async function savePricingConfig(
  db: Db,
  usdNgnRate: number,
  minPriceNgn: number,
  tiers: PricingTier[],
  settings: AppSettings
) {
  for (const [key, value] of [
    ["usd_ngn_rate", usdNgnRate],
    ["min_price_ngn", minPriceNgn],
  ] as const) {
    await db
      .insert(siteSettings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: String(value) } });
  }

  const normalized = tiers && tiers.length ? tiers.map(normalizeTier) : defaultTiers(settings);
  await db
    .insert(siteSettings)
    .values({ key: TIERS_KEY, value: JSON.stringify(normalized) })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: JSON.stringify(normalized) } });
}

export function pickTier(costNgn: number, tiers: PricingTier[]): PricingTier {
  const ordered = [...tiers].sort((a, b) => {
    const aInf = a.maxCostNgn === null ? 1 : 0;
    const bInf = b.maxCostNgn === null ? 1 : 0;
    if (aInf !== bInf) return aInf - bInf;
    return (a.maxCostNgn ?? 0) - (b.maxCostNgn ?? 0);
  });
  for (const tier of ordered) {
    if (tier.maxCostNgn === null || costNgn <= tier.maxCostNgn) return tier;
  }
  return ordered[ordered.length - 1];
}

export function roundToNearest(value: number, nearest = 10): number {
  return Math.ceil(value / nearest) * nearest;
}

/**
 * Pure, synchronous price computation from an already-fetched pricing
 * config. Use this when pricing multiple offers at once so the DB is
 * only queried once (via getPricingConfig) instead of once per offer.
 */
export function priceFromConfig(costUsd: number, cfg: PricingConfig): number {
  const costNgn = costUsd * cfg.usdNgnRate;
  const tier = pickTier(costNgn, cfg.tiers);

  const withPercent = costNgn * (1 + tier.markupPercent / 100);
  const withFlat = withPercent + tier.markupFlatNgn;

  const finalPrice = Math.max(withFlat, cfg.minPriceNgn);
  return roundToNearest(finalPrice);
}

export async function priceForCustomer(costUsd: number, db: Db | null, settings: AppSettings): Promise<number> {
  const cfg = await getPricingConfig(db, settings);
  return priceFromConfig(costUsd, cfg);
}

export async function marginBreakdown(costUsd: number, db: Db | null, settings: AppSettings) {
  const cfg = await getPricingConfig(db, settings);
  const costNgn = costUsd * cfg.usdNgnRate;
  const priceNgn = await priceForCustomer(costUsd, db, settings);
  const marginNgn = priceNgn - costNgn;
  const marginPct = costNgn ? (marginNgn / costNgn) * 100 : 0;
  return {
    cost_usd: Math.round(costUsd * 10000) / 10000,
    cost_ngn: Math.round(costNgn * 100) / 100,
    price_ngn: priceNgn,
    margin_ngn: Math.round(marginNgn * 100) / 100,
    margin_pct: Math.round(marginPct * 10) / 10,
  };
}
