import { fetchWithTimeout } from "./fetchWithTimeout";
import { Offer, ProviderLookupError, ReservedNumber, SMSProvider } from "./types";

const BASE_URL = "https://api.sms-man.com/control";

export class SmsManProvider implements SMSProvider {
  name = "smsman";
  private token: string;

  constructor(apiKey: string) {
    this.token = apiKey;
  }

  async listOffers(service: string, country: string): Promise<Offer[]> {
    const cost = await this.getPriceUsd(service, country);
    return [{ operator: "any", costUsd: cost }];
  }

  async getPriceUsd(service: string, country: string): Promise<number> {
    const url = new URL(`${BASE_URL}/limits`);
    url.searchParams.set("token", this.token);
    url.searchParams.set("country_id", country);
    url.searchParams.set("application_id", service);

    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`SMS-Man limits request failed: ${response.status}`);
    const data: any[] = await response.json();

    const costs = data.map((row) => Number(row.cost_place)).filter((n) => Number.isFinite(n));
    if (costs.length === 0) throw new ProviderLookupError(`No price found for ${service}/${country}`);
    return Math.min(...costs);
  }

  async reserveNumber(service: string, country: string): Promise<ReservedNumber> {
    const url = new URL(`${BASE_URL}/get-number`);
    url.searchParams.set("token", this.token);
    url.searchParams.set("country_id", country);
    url.searchParams.set("application_id", service);

    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`SMS-Man get-number request failed: ${response.status}`);
    const data: any = await response.json();

    if ("error_code" in data) {
      throw new ProviderLookupError(data.error_msg ?? "No numbers available");
    }
    return {
      providerOrderId: String(data.request_id),
      phoneNumber: data.number,
      costUsd: Number(data.cost ?? 0),
    };
  }

  async checkSms(providerOrderId: string): Promise<string | null> {
    const url = new URL(`${BASE_URL}/get-sms`);
    url.searchParams.set("token", this.token);
    url.searchParams.set("request_id", providerOrderId);

    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`SMS-Man get-sms request failed: ${response.status}`);
    const data: any = await response.json();
    return data.sms_code ?? null;
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    const url = new URL(`${BASE_URL}/set-status`);
    url.searchParams.set("token", this.token);
    url.searchParams.set("request_id", providerOrderId);
    url.searchParams.set("status", "reject");

    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`SMS-Man set-status request failed: ${response.status}`);
  }
}
