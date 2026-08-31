export interface ReservedNumber {
  providerOrderId: string;
  phoneNumber: string;
  costUsd: number;
}

export interface Offer {
  operator: string;
  costUsd: number;
  successRate?: number | null; // 0-100
  available?: number | null;
}

/** Thrown for "no stock" / "purchase rejected" — the fallback chain treats
 * this as "try the next provider", same role as Python's LookupError. */
export class ProviderLookupError extends Error {}

export interface SMSProvider {
  name: string;
  getPriceUsd(service: string, country: string): Promise<number>;
  listOffers(service: string, country: string): Promise<Offer[]>;
  reserveNumber(service: string, country: string, operator?: string): Promise<ReservedNumber>;
  checkSms(providerOrderId: string): Promise<string | null>;
  cancelOrder(providerOrderId: string): Promise<void>;
}
