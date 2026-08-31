import { Offer, ProviderLookupError, ReservedNumber, SMSProvider } from "./types";

export class FiveSimProvider implements SMSProvider {
  name = "fivesim";
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };
  }

  /** Country catalog for populating the buy screen's dropdowns — browsing only, no auth needed. */
  async getCountries(): Promise<Array<{ code: string; name: string; iso: string | null; prefix: string | null }>> {
    const url = `${this.baseUrl}/guest/countries`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`5SIM countries request failed: ${response.status} ${await response.text()}`);
    }
    const data: any = await response.json();

    const countries = Object.entries<any>(data).map(([countryCode, countryData]) => {
      const isoData = countryData?.iso ?? {};
      const prefixData = countryData?.prefix ?? {};
      return {
        code: countryCode,
        name: countryData?.text_en ?? countryCode.replace(/-/g, " "),
        iso: Object.keys(isoData)[0] ?? null,
        prefix: Object.keys(prefixData)[0] ?? null,
      };
    });

    countries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return countries;
  }

  /** Services/products available for a country — browsing only, no auth needed. */
  async getServices(
    country: string,
    operator = "any"
  ): Promise<Array<{ service: string; category: string | null; available: number; cost_usd: number }>> {
    country = country.trim().toLowerCase();
    operator = operator.trim().toLowerCase();

    const url = `${this.baseUrl}/guest/products/${country}/${operator}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`5SIM services request failed: ${response.status} ${await response.text()}`);
    }
    const data: any = await response.json();

    const services = Object.entries<any>(data)
      .map(([serviceName, serviceData]) => ({
        service: serviceName,
        category: serviceData?.Category ?? null,
        available: Number(serviceData?.Qty ?? 0),
        cost_usd: Number(serviceData?.Price ?? 0),
      }))
      .filter((s) => s.available > 0);

    services.sort((a, b) => a.service.toLowerCase().localeCompare(b.service.toLowerCase()));
    return services;
  }

  async listOffers(service: string, country: string): Promise<Offer[]> {
    service = service.trim().toLowerCase();
    country = country.trim().toLowerCase();

    const url = new URL(`${this.baseUrl}/guest/prices`);
    url.searchParams.set("country", country);
    url.searchParams.set("product", service);

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new ProviderLookupError(`No numbers available for ${service}/${country}: ${await response.text()}`);
    }

    const data: any = await response.json();
    const productData = data?.[country]?.[service];
    if (!productData) {
      throw new ProviderLookupError(`No numbers available for ${service}/${country}`);
    }

    const offers: Offer[] = [];
    for (const [operatorName, operatorData] of Object.entries<any>(productData)) {
      const count = Number(operatorData?.count ?? 0);
      if (count <= 0) continue;
      const cost = Number(operatorData?.cost);
      if (!Number.isFinite(cost)) continue;
      const rate = operatorData?.rate;
      offers.push({
        operator: operatorName,
        costUsd: cost,
        successRate: rate != null ? Number(rate) : null,
        available: count,
      });
    }

    if (offers.length === 0) {
      throw new ProviderLookupError(`No numbers available for ${service}/${country}`);
    }

    offers.sort((a, b) => a.costUsd - b.costUsd);
    return offers;
  }

  async getPriceUsd(service: string, country: string): Promise<number> {
    const offers = await this.listOffers(service, country);
    return Math.min(...offers.map((o) => o.costUsd));
  }

  async reserveNumber(service: string, country: string, operator = "any"): Promise<ReservedNumber> {
    service = service.trim().toLowerCase();
    country = country.trim().toLowerCase();
    operator = (operator || "any").trim().toLowerCase();

    const url = `${this.baseUrl}/user/buy/activation/${country}/${operator}/${service}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorData: any = await response.json();
        errorMessage = errorData?.message || errorData?.error || (await response.text());
      } catch {
        errorMessage = await response.text();
      }
      throw new ProviderLookupError(`5SIM purchase failed: ${errorMessage}`);
    }

    const data: any = await response.json();
    return {
      providerOrderId: String(data.id),
      phoneNumber: data.phone,
      costUsd: Number(data.price),
    };
  }

  async checkSms(providerOrderId: string): Promise<string | null> {
    const url = `${this.baseUrl}/user/check/${providerOrderId}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`5SIM SMS check failed: ${response.status} ${await response.text()}`);
    }
    const data: any = await response.json();
    const smsList = data?.sms ?? [];
    return smsList.length > 0 ? smsList[0]?.code ?? null : null;
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    const url = `${this.baseUrl}/user/cancel/${providerOrderId}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`5SIM cancel failed: ${response.status} ${await response.text()}`);
    }
  }
}
