import type { FiveSimCountriesResponse, FiveSimGuestPrices, FiveSimGuestProducts, FiveSimOrder } from './types';
import { ProviderError } from '../../lib/provider-errors';
import type { UpstreamActivationSummary } from '../activation-provider';

const BASE_URL = process.env.PROVIDER_BASE_URL || 'https://5sim.net/v1';

const READ_TIMEOUT_MS = 10_000;
const BUY_TIMEOUT_MS = 15_000;

function getApiKey() {
  const key = process.env.PROVIDER_API_KEY || process.env.FIVESIM_API_KEY;
  if (!key) throw new Error('PROVIDER_API_KEY (or FIVESIM_API_KEY) is not set');
  return key;
}

/**
 * Every failure is thrown as a ProviderError that says WHY: a clear rejection
 * (4xx) vs. a timeout / dropped connection / 5xx / unreadable reply. Purchases
 * rely on that difference to decide whether a refund is safe.
 */
async function fivesimFetch<T>(path: string, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false) {
    headers.Authorization = `Bearer ${getApiKey()}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? READ_TIMEOUT_MS)
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError({ kind: 'timeout' });
    throw new ProviderError({ kind: 'network', message: err instanceof Error ? err.message : 'fetch failed' });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ProviderError({ kind: 'http', status: res.status, body: body.slice(0, 300) });
  }

  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    // 5sim answers some refusals as a plain-text line (even with HTTP 200). Those are
    // clear "nothing was bought" answers; any OTHER unreadable reply stays uncertain.
    if (KNOWN_PLAIN_TEXT_REFUSALS.some((phrase) => text.trim().toLowerCase().startsWith(phrase))) {
      throw new ProviderError({ kind: 'http', status: 400, body: text.slice(0, 300) });
    }
    throw new ProviderError({ kind: 'invalid_response', message: err instanceof Error ? err.message : 'bad json' });
  }
}

const KNOWN_PLAIN_TEXT_REFUSALS = [
  'no free phones',
  'not enough user balance',
  'not enough rating',
  'no product',
  'bad country',
  'bad operator',
  'select country',
  'select operator'
];

/** Guest endpoint — no API key needed. Every country 5sim currently sells numbers for. */
export function getGuestCountries() {
  return fivesimFetch<FiveSimCountriesResponse>('/guest/countries', { auth: false });
}

/** Guest endpoint — no API key needed. Prices/quantities for every product in a country. */
export function getGuestProducts(country: string, operator = 'any') {
  return fivesimFetch<FiveSimGuestProducts>(`/guest/products/${country}/${operator}`, { auth: false });
}

/** Guest endpoint — per-operator breakdown (cost, stock, success rate) for one product in one country. */
export function getGuestPrices(country: string, product: string) {
  const params = new URLSearchParams({ country, product });
  return fivesimFetch<FiveSimGuestPrices>(`/guest/prices?${params.toString()}`, { auth: false });
}

/**
 * Buys one activation number. 5sim debits your 5sim balance immediately on success.
 * NEVER retried automatically: a retry after a timeout could buy a second number.
 * A "200" whose body lacks an id/phone is treated as an unreadable reply (uncertain).
 */
export async function buyActivation(params: { country: string; operator: string; product: string }) {
  const order = await fivesimFetch<FiveSimOrder>(
    `/user/buy/activation/${params.country}/${params.operator}/${params.product}`,
    { timeoutMs: BUY_TIMEOUT_MS }
  );
  if (!order || typeof order !== 'object' || order.id == null || !order.phone) {
    throw new ProviderError({ kind: 'invalid_response', message: 'buy reply missing id or phone' });
  }
  return order;
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

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  return undefined;
}

/** Newest-first list of our recent activation purchases at 5sim. */
export async function listRecentActivations(limit: number): Promise<UpstreamActivationSummary[]> {
  const params = new URLSearchParams({
    category: 'activation',
    limit: String(limit),
    offset: '0',
    order: 'id',
    reverse: 'true'
  });
  const body = await fivesimFetch<Record<string, unknown>>(`/user/orders?${params.toString()}`);
  const rows = (pick(body, 'Data', 'data') as Record<string, unknown>[] | undefined) ?? null;
  if (!Array.isArray(rows)) {
    throw new ProviderError({ kind: 'invalid_response', message: 'orders history had no data array' });
  }

  const out: UpstreamActivationSummary[] = [];
  for (const row of rows) {
    const id = pick(row, 'ID', 'id');
    const created = pick(row, 'CreatedAt', 'created_at');
    const country = pick(row, 'Country', 'country');
    const product = pick(row, 'Product', 'product');
    const createdMs = typeof created === 'string' ? Date.parse(created) : NaN;
    if (id == null || !country || !product || Number.isNaN(createdMs)) {
      // A row we can't read is a row we can't safely rule in OR out — fail the whole read.
      throw new ProviderError({ kind: 'invalid_response', message: 'orders history row not understood' });
    }
    const operator = pick(row, 'Operator', 'operator');
    out.push({
      providerOrderId: String(id),
      createdAtMs: createdMs,
      country: String(country),
      product: String(product),
      operator: typeof operator === 'string' ? operator : null
    });
  }
  return out;
}
