import { Offer, ReservedNumber, SMSProvider } from "./types";

const MOCK_PRICES: Record<string, number> = {
  "whatsapp:nigeria": 0.28,
  "google:nigeria": 0.18,
  "facebook:nigeria": 0.15,
  "telegram:nigeria": 0.12,
};
const DEFAULT_PRICE = 0.2;

/**
 * In-memory "arrived SMS" store, keyed by provider_order_id. Same
 * single-process assumption the Python version made — fine for local
 * `wrangler dev` (one long-lived process), but note that in a deployed
 * Worker, isolates aren't guaranteed to persist between requests, so this
 * module-level state can't be relied on in production. That's fine: nobody
 * should be running PROVIDER=mock in production anyway — it exists purely
 * so you can test the buy → poll → receive flow without spending real
 * money against 5SIM/SMS-Man while developing.
 */
const pending = new Map<string, number>(); // orderId -> polls remaining before "SMS arrives"

function randomDigits(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export class MockProvider implements SMSProvider {
  name = "mock";

  async getPriceUsd(service: string, country: string): Promise<number> {
    return MOCK_PRICES[`${service.toLowerCase()}:${country.toLowerCase()}`] ?? DEFAULT_PRICE;
  }

  async listOffers(service: string, country: string): Promise<Offer[]> {
    const cost = await this.getPriceUsd(service, country);
    return [{ operator: "any", costUsd: cost }];
  }

  async reserveNumber(service: string, country: string): Promise<ReservedNumber> {
    const orderId = crypto.randomUUID();
    const fakeNumber = "+234" + randomDigits(10);
    pending.set(orderId, 2 + Math.floor(Math.random() * 4)); // arrives after a few polls
    const cost = await this.getPriceUsd(service, country);
    return { providerOrderId: orderId, phoneNumber: fakeNumber, costUsd: cost };
  }

  async checkSms(providerOrderId: string): Promise<string | null> {
    const remaining = pending.get(providerOrderId);
    if (remaining === undefined) return null;
    if (remaining <= 0) return randomDigits(6);
    pending.set(providerOrderId, remaining - 1);
    return null;
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    pending.delete(providerOrderId);
  }
}
