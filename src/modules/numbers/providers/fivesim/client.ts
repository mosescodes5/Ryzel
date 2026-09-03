import type { FiveSimCountriesResponse, FiveSimGuestPrices, FiveSimGuestProducts, FiveSimOrder } from './types';

const BASE_URL = process.env.PROVIDER_BASE_URL || 'https://5sim.net/v1';

function getApiKey() {
  const key = process.env.PROVIDER_API_KEY || process.env.FIVESIM_API_KEY;
  if (!key) throw new Error('PROVIDER_API_KEY (or FIVESIM_API_KEY) is not set');
  return key;
}

async function fivesimFetch<T>(path: string, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false) {
    headers.Authorization = `Bearer ${getApiKey()}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`5sim request failed (${res.status} ${path}): ${text || res.statusText}`);
  }

  return res.json();
}

/** Guest endpoint — no API key needed. Every country 5sim currently sells numbers for. */
export function getGuestCountries() {
  return fivesimFetch<FiveSimCountriesResponse>('/guest/countries', { auth: false });
}

/** Guest endpoint — no API key needed. Prices/quantities for every product in a country. */
export function getGuestProducts(country: string, operator = 'any') {
  return fivesimFetch<FiveSimGuestProducts>(`/guest/products/${country}/${operator}`, { auth: false });
}

/**
 * Guest endpoint — no API key needed. Per-operator breakdown (cost, stock,
 * historical success rate) for one product in one country — this is what
 * powers the "Available Numbers" list shown after Check Availability,
 * since a single product can have several operator pools at different
 * prices/success rates.
 */
export function getGuestPrices(country: string, product: string) {
  const params = new URLSearchParams({ country, product });
  return fivesimFetch<FiveSimGuestPrices>(`/guest/prices?${params.toString()}`, { auth: false });
}

/** Buys one activation number. 5sim debits your 5sim balance immediately on success. */
export function buyActivation(params: { country: string; operator: string; product: string }) {
  return fivesimFetch<FiveSimOrder>(
    `/user/buy/activation/${params.country}/${params.operator}/${params.product}`
  );
}

export function checkOrder(orderId: string) {
  return fivesimFetch<FiveSimOrder>(`/user/check/${orderId}`);
}

export function cancelOrder(orderId: string) {
  return fivesimFetch<FiveSimOrder>(`/user/cancel/${orderId}`);
}

export function finishOrder(orderId: string) {
  return fivesimFetch<FiveSimOrder>(`/user/finish/${orderId}`);
}

export function getBalance() {
  return fivesimFetch<{ balance: number; rating: number }>('/user/profile');
}
