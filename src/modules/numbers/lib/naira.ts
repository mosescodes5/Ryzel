/**
 * Money on this platform is whole NAIRA. There is no kobo anywhere in the
 * numbers flow. (The database columns are still named *_cents for legacy
 * reasons, but they hold whole naira — see supabase/migrations/0012.)
 */

export class PricingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingConfigError';
  }
}

/**
 * FIVESIM_NGN_PER_UNIT = how many naira equal ONE unit of the `price` /
 * `cost` field that 5sim returns. It must be set deliberately after checking
 * which currency your 5sim account is billed in — if it is missing or
 * invalid, selling numbers is switched off rather than guessing a price.
 */
export function parseNairaPerUnit(raw: string | undefined | null): number {
  const rate = Number(raw);
  if (!raw || !Number.isFinite(rate) || rate <= 0) {
    throw new PricingConfigError(
      'Number pricing is not configured yet (FIVESIM_NGN_PER_UNIT). Purchases are paused.'
    );
  }
  return rate;
}

/** Converts a 5sim price into whole naira, always rounding UP so we never undercharge. */
export function toNaira(providerPrice: number, nairaPerUnit: number): number {
  if (!Number.isFinite(providerPrice) || providerPrice < 0) {
    throw new PricingConfigError('Provider returned an invalid price.');
  }
  if (providerPrice === 0) return 0;
  // Round to 6 dp first so 0.1 * 3 style float noise cannot push us up an extra naira.
  const exact = Math.round(providerPrice * nairaPerUnit * 1e6) / 1e6;
  return Math.max(1, Math.ceil(exact));
}

/** Formats whole naira for display, e.g. 1500 -> "₦1,500". */
export function formatNairaAmount(naira: number): string {
  return `₦${Math.round(naira).toLocaleString('en-NG')}`;
}
