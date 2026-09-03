export type ActivationCountry = {
  code: string; // 5sim's country slug, e.g. 'usa', 'england'
  name: string; // human-readable, e.g. 'United States'
};

export type ActivationOffer = {
  operator: string; // a specific pool id (or 'virtual21', 'beeline', etc — provider-specific), never 'any'
  costCents: number; // what the provider charges RYZEL for this pool, in minor units
  successRate: number | null; // 0-100 historical delivery rate for this pool, if the provider reports one
  quantity: number; // how many are currently available in this pool
};

export type ActivationProduct = {
  product: string; // e.g. 'telegram', 'whatsapp', 'google'
  operator: string; // e.g. 'any', or a specific carrier the provider uses
  costCents: number; // what the provider charges RYZEL, in minor units
  quantity: number; // how many are currently available
};

export type ActivationOrder = {
  providerOrderId: string;
  phoneNumber: string;
  product: string;
  operator: string;
  country: string;
  costCents: number;
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
}
