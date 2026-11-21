export type ActivationCountry = {
  code: string; // 5sim's country slug, e.g. 'usa', 'england'
  name: string; // human-readable, e.g. 'United States'
};

export type ActivationOffer = {
  operator: string; // a specific pool id (or 'virtual21', 'beeline', etc — provider-specific), never 'any'
  costNaira: number; // what the provider charges RYZEL for this pool, in whole naira (rounded up)
  successRate: number | null; // 0-100 historical delivery rate for this pool, if the provider reports one
  quantity: number; // how many are currently available in this pool
};

export type ActivationProduct = {
  product: string; // e.g. 'telegram', 'whatsapp', 'google'
  operator: string; // e.g. 'any', or a specific carrier the provider uses
  costNaira: number; // what the provider charges RYZEL, in whole naira (rounded up)
  quantity: number; // how many are currently available
};

export type UpstreamActivationSummary = {
  providerOrderId: string;
  createdAtMs: number;
  country: string;
  product: string;
  operator: string | null;
};

export type ActivationOrder = {
  providerOrderId: string;
  phoneNumber: string;
  product: string;
  operator: string;
  country: string;
  costNaira: number;
  status: 'awaiting_sms' | 'received' | 'cancelled' | 'expired' | 'finished' | 'failed';
  smsCode: string | null;
  smsText: string | null;
  expiresAt: string | null;
};

/**
 * Contract for a "buy a number to receive one SMS for a specific service"
 * provider (5sim today). Distinct from `NumberProvider` (monthly rental
 * lines) — activation numbers are a different product shape, so this gets
 * its own interface rather than being forced into the rental one.
 */
export interface ActivationProvider {
  readonly name: string;
  listCountries(): Promise<ActivationCountry[]>;
  listProducts(params: { country: string }): Promise<ActivationProduct[]>;
  listOffers(params: { country: string; product: string }): Promise<ActivationOffer[]>;
  buyActivation(params: { country: string; operator: string; product: string }): Promise<ActivationOrder>;
  checkOrder(providerOrderId: string): Promise<ActivationOrder>;
  cancelOrder(providerOrderId: string): Promise<void>;
  finishOrder(providerOrderId: string): Promise<void>;
  /** Newest-first list of what we recently bought upstream; used to settle purchases whose outcome we never saw. */
  listRecentActivations(limit: number): Promise<UpstreamActivationSummary[]>;
}
