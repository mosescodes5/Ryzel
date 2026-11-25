import { z } from "zod";
import { providerPriceToMinor } from "../../shared/money";

/** 5SIM order status values documented at https://5sim.net/docs ("Order statuses"). */
export const PROVIDER_STATUSES = ["PENDING", "RECEIVED", "CANCELED", "TIMEOUT", "FINISHED", "BANNED"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");

/** Order IDs are JSON numbers. Reject anything that cannot be represented exactly. */
const providerId = z
  .union([
    z.number().int().positive().refine(Number.isSafeInteger, "unsafe integer id"),
    z.string().regex(/^\d{1,19}$/),
  ])
  .transform((v) => String(v));

/**
 * SMS parsing is deliberately lenient: a missing optional field must never hide an OTP.
 * Only `text` is required. Activation SMS objects have NO id in the docs (only hosting does).
 */
export const smsSchema = z.object({
  id: z.number().int().optional(),
  created_at: isoDate.optional(),
  date: isoDate.optional(),
  sender: z.string().nullish().transform((v) => v ?? ""),
  text: z.string(),
  code: z.string().nullish().transform((v) => v ?? ""),
});
export type FiveSimSms = z.output<typeof smsSchema>;

const smsList = z.array(smsSchema).nullish().transform((v) => v ?? []);

export const orderSchema = z.object({
  id: providerId,
  phone: z.string().min(1),
  operator: z.string().optional(), // absent in documented check/finish/cancel examples
  product: z.string(),
  price: z.number().nonnegative(),
  status: z.enum(PROVIDER_STATUSES),
  expires: isoDate,
  sms: smsList, // buy returns `null`
  created_at: isoDate,
  forwarding: z.boolean().optional(),
  forwarding_number: z.string().optional(),
  country: z.string(),
});
export type FiveSimOrder = z.output<typeof orderSchema>;

/** Buy response must include operator (documented). */
export const buyOrderSchema = orderSchema.extend({ operator: z.string().min(1) });

export const profileSchema = z.object({
  id: z.number(),
  email: z.string().optional(),
  vendor: z.string().optional(),
  balance: z.number(),
  frozen_balance: z.number().optional(),
  rating: z.number(),
  default_country: z.object({ name: z.string(), iso: z.string(), prefix: z.string() }).partial().optional(),
});
export type FiveSimProfile = z.output<typeof profileSchema>;

export const productsSchema = z.record(
  z.string(),
  z.object({ Category: z.enum(["activation", "hosting"]), Qty: z.number(), Price: z.number() }),
);

const priceCell = z.object({ cost: z.number(), count: z.number().int(), rate: z.number().optional() });
const opMap = z.record(z.string(), priceCell);
export const pricesNestedSchema = z.record(z.string(), z.record(z.string(), opMap));

export const countriesSchema = z.record(
  z.string(),
  z
    .object({
      iso: z.record(z.string(), z.number()),
      prefix: z.record(z.string(), z.number()),
      text_en: z.string(),
    })
    .catchall(z.record(z.string(), z.number())),
);

export const ordersPageSchema = z.object({
  Data: z.array(z.unknown()).nullish().transform((v) => v ?? []),
  Total: z.number().int().nonnegative(),
});

export const paymentsPageSchema = z.object({
  Data: z
    .array(
      z.object({
        ID: z.number(),
        TypeName: z.string(),
        ProviderName: z.string(),
        Amount: z.number(),
        Balance: z.number(),
        CreatedAt: isoDate,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  Total: z.number().int().nonnegative(),
});

// ---- Normalised catalog rows (provider DTO -> flat internal rows) ----

export interface CatalogPriceRow {
  country: string;
  product: string;
  operator: string;
  costMinor: number; // provider currency minor units (1/100)
  count: number;
  rate: number | undefined;
}

export interface CatalogCountry {
  slug: string;
  name: string;
  iso: string[];
  prefixes: string[];
  operators: string[];
}

export function flattenPrices(
  nested: z.output<typeof pricesNestedSchema>,
  layout: "country-first" | "product-first",
): CatalogPriceRow[] {
  const rows: CatalogPriceRow[] = [];
  for (const [k1, level2] of Object.entries(nested)) {
    for (const [k2, ops] of Object.entries(level2)) {
      for (const [operator, cell] of Object.entries(ops)) {
        rows.push({
          country: layout === "country-first" ? k1 : k2,
          product: layout === "country-first" ? k2 : k1,
          operator,
          costMinor: providerPriceToMinor(cell.cost),
          count: cell.count,
          rate: cell.rate,
        });
      }
    }
  }
  return rows;
}

export function normaliseCountries(raw: z.output<typeof countriesSchema>): CatalogCountry[] {
  return Object.entries(raw).map(([slug, v]) => {
    const { iso, prefix, text_en, ...rest } = v as Record<string, unknown> & typeof v;
    return {
      slug,
      name: text_en,
      iso: Object.keys(iso),
      prefixes: Object.keys(prefix),
      operators: Object.keys(rest),
    };
  });
}
