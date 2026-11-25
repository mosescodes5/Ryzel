/**
 * Money primitives. All Naira amounts are integer kobo. No floating point in money math.
 * The only float we ever touch is the provider's `cost` (documented as two decimals),
 * which is converted once, at the boundary, to integer provider minor units.
 */
export type Kobo = number & { readonly __brand: "Kobo" };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function asKobo(n: number): Kobo {
  if (!Number.isSafeInteger(n) || n < 0) throw new MoneyError(`Invalid kobo amount: ${n}`);
  return n as Kobo;
}

/** Parse a non-negative decimal string into a scaled bigint (e.g. "18.5", 6 -> 18500000n). */
export function parseDecimalScaled(input: string, scaleDigits: number): bigint {
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(input.trim());
  if (!m) throw new MoneyError(`Invalid decimal: "${input}"`);
  const frac = m[2] ?? "";
  if (frac.length > scaleDigits) throw new MoneyError(`Too many decimal places (max ${scaleDigits}): "${input}"`);
  return BigInt(m[1]! + frac.padEnd(scaleDigits, "0"));
}

/**
 * Convert 5SIM's documented two-decimal `cost` float to integer provider minor units (1/100).
 * If the provider ever returns more precision, round UP (never understate our cost).
 */
export function providerPriceToMinor(cost: number): number {
  if (!Number.isFinite(cost) || cost < 0) throw new MoneyError(`Invalid provider cost: ${cost}`);
  const scaled = cost * 100;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : Math.ceil(scaled - 1e-9);
}

export const FX_SCALE_DIGITS = 6;

/**
 * providerMinor (1/100 of a provider currency unit) x fxRate (NGN per 1 provider unit) -> kobo.
 * Units cancel exactly: (minor/100 units) x rate NGN x 100 kobo = minor x rate kobo.
 * Rounds UP so cost is never understated.
 */
export function convertToKobo(providerMinor: number, fxRate: string): Kobo {
  if (!Number.isSafeInteger(providerMinor) || providerMinor < 0) throw new MoneyError("Invalid provider minor amount");
  const rate = parseDecimalScaled(fxRate, FX_SCALE_DIGITS);
  if (rate <= 0n) throw new MoneyError("FX rate must be positive");
  const scale = 10n ** BigInt(FX_SCALE_DIGITS);
  const num = BigInt(providerMinor) * rate;
  return asKobo(Number((num + scale - 1n) / scale));
}

/** kobo x basis points / 10000, half-up, bigint-safe. */
export function applyBps(kobo: Kobo, bps: number): Kobo {
  if (!Number.isInteger(bps) || bps < 0 || bps > 1_000_000) throw new MoneyError(`Invalid bps: ${bps}`);
  return asKobo(Number((BigInt(kobo) * BigInt(bps) + 5000n) / 10000n));
}

export type RoundingMode = "up" | "nearest" | "down";

export function roundToIncrement(kobo: Kobo, incrementKobo: number, mode: RoundingMode): Kobo {
  if (!Number.isSafeInteger(incrementKobo) || incrementKobo <= 0) throw new MoneyError("Invalid rounding increment");
  const k = BigInt(kobo);
  const inc = BigInt(incrementKobo);
  let out: bigint;
  if (mode === "up") out = ((k + inc - 1n) / inc) * inc;
  else if (mode === "down") out = (k / inc) * inc;
  else out = ((k * 2n + inc) / (inc * 2n)) * inc;
  return asKobo(Number(out));
}

export function addKobo(a: Kobo, b: Kobo): Kobo {
  return asKobo(a + b);
}
