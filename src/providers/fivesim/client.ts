import type { z } from "zod";
import { classifyProviderMessage, FiveSimError, type FiveSimErrorCode } from "./errors";
import {
  buyOrderSchema, countriesSchema, flattenPrices, normaliseCountries, orderSchema, ordersPageSchema,
  paymentsPageSchema, pricesNestedSchema, productsSchema, profileSchema,
  type CatalogCountry, type CatalogPriceRow, type FiveSimOrder, type FiveSimProfile,
} from "./schemas";

export interface FiveSimLogEvent {
  event: "fivesim_request";
  path: string; // path only: never contains the API key, never contains bodies/OTPs
  status?: number;
  durationMs: number;
  attempt: number;
  outcome: "ok" | "http_error" | "timeout" | "network";
}

export interface FiveSimClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxReadRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: (e: FiveSimLogEvent) => void;
}

/**
 * Buying is the one operation where the outcome can be UNKNOWN. Callers must handle all three
 * kinds. `uncertain` means a provider order MAY exist: never retry the buy; reconcile.
 */
export type BuyOutcome =
  | { kind: "created"; order: FiveSimOrder; raw: unknown }
  | { kind: "rejected"; code: FiveSimErrorCode; message: string; httpStatus: number }
  | {
      kind: "uncertain";
      reason: "timeout" | "network" | "server_error" | "malformed_response" | "unexpected_status";
      httpStatus?: number;
      rawBody?: string;
    };

const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const ORDER_ID = /^\d{1,19}$/;

function slug(label: string, v: string): string {
  if (!SLUG.test(v)) throw new FiveSimError({ code: "INVALID_SELECTION", message: `Invalid ${label}` });
  return encodeURIComponent(v);
}
function orderId(v: string): string {
  if (!ORDER_ID.test(v)) throw new FiveSimError({ code: "INVALID_SELECTION", message: "Invalid order id" });
  return v;
}

export class FiveSimClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxReadRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: ((e: FiveSimLogEvent) => void) | undefined;

  constructor(o: FiveSimClientOptions) {
    if (!o.apiKey) throw new Error("FiveSimClient: apiKey is required");
    this.apiKey = o.apiKey;
    this.baseUrl = (o.baseUrl ?? "https://5sim.net/v1").replace(/\/+$/, "");
    this.timeoutMs = o.timeoutMs ?? 15_000;
    this.maxReadRetries = o.maxReadRetries ?? 2;
    this.fetchImpl = o.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.logger = o.logger;
  }

  // ------------------------------------------------------------------ account
  getProfile(): Promise<FiveSimProfile> {
    return this.get("/user/profile", profileSchema, { auth: true, retry: true });
  }

  async listPayments(p: { limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams({ order: "id", reverse: "true" });
    if (p.limit !== undefined) q.set("limit", String(p.limit));
    if (p.offset !== undefined) q.set("offset", String(p.offset));
    return this.get(`/user/payments?${q}`, paymentsPageSchema, { auth: true, retry: true });
  }

  // ------------------------------------------------------------------ catalog (public)
  async getCountries(): Promise<CatalogCountry[]> {
    const raw = await this.get("/guest/countries", countriesSchema, { auth: false, retry: true });
    return normaliseCountries(raw);
  }

  /** Activation products with stock/price for a country+operator ("any" allowed). */
  async getProducts(country: string, operator: string) {
    const raw = await this.get(
      `/guest/products/${slug("country", country)}/${slug("operator", operator)}`,
      productsSchema,
      { auth: false, retry: true },
    );
    return Object.entries(raw)
      .filter(([, v]) => v.Category === "activation")
      .map(([product, v]) => ({ product, qty: v.Qty, price: v.Price }));
  }

  /** NOTE: response nesting differs: product-only is product->country->operator. */
  async getPrices(f: { country?: string; product?: string } = {}): Promise<CatalogPriceRow[]> {
    const q = new URLSearchParams();
    if (f.country) q.set("country", slug("country", f.country));
    if (f.product) q.set("product", slug("product", f.product));
    const path = q.size ? `/guest/prices?${q}` : "/guest/prices";
    const nested = await this.get(path, pricesNestedSchema, { auth: false, retry: true });
    const layout = f.product && !f.country ? "product-first" : "country-first";
    return flattenPrices(nested, layout);
  }

  // ------------------------------------------------------------------ order reads
  checkOrder(id: string): Promise<FiveSimOrder> {
    return this.get(`/user/check/${orderId(id)}`, orderSchema, { auth: true, retry: true });
  }

  /** Per-item validation: one odd order must not hide the rest. Used by reconciliation. */
  async listActivationOrders(p: { limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams({ category: "activation", order: "id", reverse: "true" });
    if (p.limit !== undefined) q.set("limit", String(p.limit));
    if (p.offset !== undefined) q.set("offset", String(p.offset));
    const page = await this.get(`/user/orders?${q}`, ordersPageSchema, { auth: true, retry: true });
    const orders: FiveSimOrder[] = [];
    let skipped = 0;
    for (const item of page.Data) {
      const r = orderSchema.safeParse(item);
      if (r.success) orders.push(r.data);
      else skipped += 1;
    }
    return { orders, skipped, total: page.Total };
  }

  // ------------------------------------------------------------------ state-changing (no auto-retry)
  // A timeout here is ambiguous too: the caller MUST follow up with checkOrder().
  finishOrder(id: string): Promise<FiveSimOrder> {
    return this.get(`/user/finish/${orderId(id)}`, orderSchema, { auth: true, retry: false });
  }
  cancelOrder(id: string): Promise<FiveSimOrder> {
    return this.get(`/user/cancel/${orderId(id)}`, orderSchema, { auth: true, retry: false });
  }
  /** Docs contradict themselves (`/user/ban/$id` vs `/user/bn/$id` in the example). Verify before exposing. */
  banOrder(id: string): Promise<FiveSimOrder> {
    return this.get(`/user/ban/${orderId(id)}`, orderSchema, { auth: true, retry: false });
  }

  // ------------------------------------------------------------------ purchase
  async buyActivation(p: { country: string; operator: string; product: string; maxPrice?: number }): Promise<BuyOutcome> {
    let path = `/user/buy/activation/${slug("country", p.country)}/${slug("operator", p.operator)}/${slug("product", p.product)}`;
    if (p.maxPrice !== undefined) {
      // Per docs, maxPrice only applies when operator === "any".
      if (p.operator !== "any" || !Number.isFinite(p.maxPrice) || p.maxPrice <= 0)
        throw new FiveSimError({ code: "INVALID_SELECTION", message: "maxPrice requires operator=any and a positive value" });
      path += `?maxPrice=${encodeURIComponent(String(p.maxPrice))}`;
    }

    // Single attempt, ever. No retry on this path.
    let res: { status: number; text: string };
    try {
      res = await this.send(path, true, 1);
    } catch (e) {
      const code = e instanceof FiveSimError ? e.code : "NETWORK";
      return { kind: "uncertain", reason: code === "TIMEOUT" ? "timeout" : "network" };
    }

    const { status, text } = res;
    if (status === 200) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // Documented: "200 no free phones" is a plain-text body.
        const code = classifyProviderMessage(text);
        if (code) return { kind: "rejected", code, message: truncate(text), httpStatus: 200 };
        return { kind: "uncertain", reason: "malformed_response", httpStatus: 200, rawBody: truncate(text, 2000) };
      }
      const parsed = buyOrderSchema.safeParse(json);
      if (!parsed.success) return { kind: "uncertain", reason: "malformed_response", httpStatus: 200, rawBody: truncate(text, 2000) };
      return { kind: "created", order: parsed.data, raw: json };
    }
    if (status === 401 || status === 403) return { kind: "rejected", code: "AUTH", message: "5SIM rejected credentials", httpStatus: status };
    if (status === 429) return { kind: "rejected", code: "RATE_LIMITED", message: "5SIM rate limit", httpStatus: status };
    if (status === 400 || status === 404) {
      return { kind: "rejected", code: classifyProviderMessage(text) ?? "BAD_REQUEST", message: truncate(text), httpStatus: status };
    }
    // 500/502/503/504 (503 is also documented as the buy rate-limit code): order may exist.
    if (status >= 500) return { kind: "uncertain", reason: "server_error", httpStatus: status, rawBody: truncate(text, 500) };
    return { kind: "uncertain", reason: "unexpected_status", httpStatus: status, rawBody: truncate(text, 500) };
  }

  // ------------------------------------------------------------------ internals
  private async send(path: string, auth: boolean, attempt: number): Promise<{ status: number; text: string }> {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth) headers.Authorization = `Bearer ${this.apiKey}`;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { method: "GET", headers, signal: ctrl.signal });
      const text = await res.text();
      this.logger?.({ event: "fivesim_request", path: stripQuery(path), status: res.status, durationMs: Date.now() - started, attempt, outcome: res.ok ? "ok" : "http_error" });
      return { status: res.status, text };
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      this.logger?.({ event: "fivesim_request", path: stripQuery(path), durationMs: Date.now() - started, attempt, outcome: aborted ? "timeout" : "network" });
      throw new FiveSimError({
        code: aborted ? "TIMEOUT" : "NETWORK",
        message: aborted ? `5SIM request timed out after ${this.timeoutMs}ms` : "5SIM network error",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<S extends z.ZodTypeAny>(
    path: string, schema: S, o: { auth: boolean; retry: boolean },
  ): Promise<z.output<S>> {
    const maxAttempts = (o.retry ? this.maxReadRetries : 0) + 1;
    for (let attempt = 1; ; attempt++) {
      try {
        const { status, text } = await this.send(path, o.auth, attempt);
        if (status === 200) return this.parseOk(text, schema);
        throw this.fromStatus(status, text);
      } catch (e) {
        const err = e instanceof FiveSimError ? e : new FiveSimError({ code: "UNKNOWN", message: "Unexpected client error", cause: e });
        if (err.retryable && attempt < maxAttempts) {
          await this.sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
          continue;
        }
        throw err;
      }
    }
  }

  private parseOk<S extends z.ZodTypeAny>(text: string, schema: S): z.output<S> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const code = classifyProviderMessage(text);
      throw new FiveSimError({ code: code ?? "MALFORMED_RESPONSE", message: code ? "5SIM returned a plain-text error" : "5SIM returned non-JSON", httpStatus: 200, providerMessage: truncate(text) });
    }
    const r = schema.safeParse(json);
    if (!r.success) {
      // Paths + issue codes only. Values may contain phone numbers or OTPs.
      const summary = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}:${i.code}`).join(", ");
      throw new FiveSimError({ code: "MALFORMED_RESPONSE", message: `5SIM response failed validation (${summary})`, httpStatus: 200 });
    }
    return r.data;
  }

  private fromStatus(status: number, text: string): FiveSimError {
    const providerMessage = truncate(text);
    if (status === 401 || status === 403) return new FiveSimError({ code: "AUTH", message: "5SIM rejected credentials", httpStatus: status });
    if (status === 429) return new FiveSimError({ code: "RATE_LIMITED", message: "5SIM rate limit", httpStatus: status, retryable: true });
    if (status >= 500) return new FiveSimError({ code: "SERVER", message: `5SIM server error ${status}`, httpStatus: status, retryable: true, providerMessage });
    if (status === 404) return new FiveSimError({ code: classifyProviderMessage(text) ?? "NOT_FOUND", message: "5SIM not found", httpStatus: status, providerMessage });
    if (status === 400) return new FiveSimError({ code: classifyProviderMessage(text) ?? "BAD_REQUEST", message: "5SIM rejected the request", httpStatus: status, providerMessage });
    return new FiveSimError({ code: "UNKNOWN", message: `Unexpected 5SIM status ${status}`, httpStatus: status, providerMessage });
  }
}

function truncate(s: string, n = 200): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
function stripQuery(p: string): string {
  const i = p.indexOf("?");
  return i === -1 ? p : p.slice(0, i);
}
