import { createAdminClient } from '@/lib/supabase/server';
import { parseNairaPerUnit, PricingConfigError } from '@/modules/numbers/lib/naira';

/**
 * The exchange rate that turns 5sim's prices into naira ("the dollar rate").
 * You set it on the admin Pricing page; it is stored in pricing_settings.
 * If the database has no rate yet, FIVESIM_NGN_PER_UNIT is the fallback.
 * With neither, selling numbers is paused (it never guesses).
 * Server-only.
 */

export type FxSetting = {
  rate: number | null; // naira per 1 unit of 5sim's price
  currency: string; // label only, e.g. 'USD'
  source: 'admin' | 'env' | 'none';
  updatedAt: string | null;
};

let cache: { value: FxSetting; at: number } | null = null;
const CACHE_MS = 10_000; // an admin change reaches every server within ~10 seconds

export function clearFxRateCache() {
  cache = null;
}

export async function getFxSetting(): Promise<FxSetting> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value: FxSetting = { rate: null, currency: 'USD', source: 'none', updatedAt: null };

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('pricing_settings')
      .select('fx_rate_ngn_per_unit, fx_currency, updated_at')
      .eq('id', true)
      .maybeSingle();

    if (data?.fx_rate_ngn_per_unit != null && Number(data.fx_rate_ngn_per_unit) > 0) {
      value = {
        rate: Number(data.fx_rate_ngn_per_unit),
        currency: data.fx_currency,
        source: 'admin',
        updatedAt: data.updated_at
      };
    } else if (data) {
      value = { ...value, currency: data.fx_currency, updatedAt: data.updated_at };
    }
  } catch (err) {
    console.error('fx rate read failed', err instanceof Error ? err.message : err);
  }

  if (value.rate === null) {
    try {
      value = { ...value, rate: parseNairaPerUnit(process.env.FIVESIM_NGN_PER_UNIT), source: 'env' };
    } catch {
      // not configured anywhere: stays null
    }
  }

  cache = { value, at: Date.now() };
  return value;
}

/** The rate, or null when selling is paused. Used where a missing rate must not break things (polling). */
export async function getNairaPerUnitOrNull(): Promise<number | null> {
  return (await getFxSetting()).rate;
}

/** The rate, or a PricingConfigError that pauses quoting and buying. */
export async function requireNairaPerUnit(): Promise<number> {
  const rate = await getNairaPerUnitOrNull();
  if (rate === null) {
    throw new PricingConfigError(
      'Number pricing is not set up yet: an admin needs to enter the dollar rate. Purchases are paused.'
    );
  }
  return rate;
}
