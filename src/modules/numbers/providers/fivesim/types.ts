// Shapes for the 5sim.net v1 API (https://5sim.net/v1). 5sim's docs and
// exact field set can shift — this covers what the provider file uses.
// See https://5sim.net/docs for the authoritative reference.

export type FiveSimGuestProductEntry = {
  Category: string;
  Qty: number;
  Price: number; // in RUB by default on 5sim; treat as the provider's cost unit
};

// GET /guest/products/{country}/{operator} → { [productName]: FiveSimGuestProductEntry }
export type FiveSimGuestProducts = Record<string, FiveSimGuestProductEntry>;

// GET /guest/countries → { [countryCode]: { iso: Record<string, number>; prefix: Record<string, number>; text_en: string; text_ru: string } }
export type FiveSimCountryEntry = {
  iso?: Record<string, number>;
  prefix?: Record<string, number>;
  text_en?: string;
  text_ru?: string;
};
export type FiveSimCountriesResponse = Record<string, FiveSimCountryEntry>;

// GET /guest/prices?country=X&product=Y → { [country]: { [product]: { [operator]: FiveSimPriceEntry } } }
export type FiveSimPriceEntry = {
  cost: number;
  count: number;
  rate?: number | null;
};
export type FiveSimGuestPrices = Record<string, Record<string, Record<string, FiveSimPriceEntry>>>;

export type FiveSimSms = {
  id: number;
  created_at: string;
  date: string;
  sender: string;
  text: string;
  code: string;
};

export type FiveSimOrder = {
  id: number;
  phone: string;
  operator: string;
  product: string;
  price: number;
  status: 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
  expires: string;
  sms: FiveSimSms[] | null;
  created_at: string;
  country: string;
};
