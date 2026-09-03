import { createClient, createAdminClient } from '@/lib/supabase/server';

export type PricingRule = {
  markupType: 'percent' | 'flat';
  markupPercent: number;
  markupFlatCents: number;
  minPriceCents: number;
};

export type ServicePricingOverride = PricingRule & {
  product: string;
  active: boolean;
  updatedAt: string;
};

const DEFAULT_RULE: PricingRule = {
  markupType: 'percent',
  markupPercent: 40,
  markupFlatCents: 0,
  minPriceCents: 50
};

async function fetchGlobalPricing(client: Awaited<ReturnType<typeof createClient>>): Promise<PricingRule> {
  const { data, error } = await client.from('number_pricing').select('*').eq('id', true).single();
  if (error || !data) {
    // Sensible fallback so a missing row never blocks a sale — 40% markup, 50c floor.
    return DEFAULT_RULE;
  }
  return {
    markupType: data.markup_type,
    markupPercent: Number(data.markup_percent),
    markupFlatCents: data.markup_flat_cents,
    minPriceCents: data.min_price_cents
  };
}

async function fetchServiceOverride(
  client: Awaited<ReturnType<typeof createClient>>,
  product: string
): Promise<PricingRule | null> {
  const { data, error } = await client
    .from('service_pricing')
    .select('*')
    .eq('product', product)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    markupType: data.markup_type,
    markupPercent: Number(data.markup_percent),
    markupFlatCents: data.markup_flat_cents,
    minPriceCents: data.min_price_cents
  };
}

async function fetchPricing(
  client: Awaited<ReturnType<typeof createClient>>,
  product?: string
): Promise<PricingRule> {
  if (product) {
    const override = await fetchServiceOverride(client, product);
    if (override) return override;
  }
  return fetchGlobalPricing(client);
}

/**
 * Public read — used by the marketplace page/API to show customer-facing
 * prices. Pass the 5sim product slug (e.g. "whatsapp") to pick up a
 * per-service override if one exists; falls back to the global markup.
 */
export async function getPricingRule(product?: string): Promise<PricingRule> {
  return fetchPricing(await createClient(), product);
}

/** Server-only read (service role) — used inside purchase flows where there's no user session yet. */
export async function getPricingRuleAsAdmin(product?: string): Promise<PricingRule> {
  return fetchPricing(createAdminClient(), product);
}

/** Every per-service override currently configured, for the admin pricing page. */
export async function listServiceOverrides(): Promise<ServicePricingOverride[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('service_pricing').select('*').order('product');
  if (error || !data) return [];

  return data.map((row) => ({
    product: row.product,
    markupType: row.markup_type,
    markupPercent: Number(row.markup_percent),
    markupFlatCents: row.markup_flat_cents,
    minPriceCents: row.min_price_cents,
    active: row.active,
    updatedAt: row.updated_at
  }));
}

/** Creates or replaces the override for one product (e.g. "whatsapp"). */
export async function upsertServiceOverride(input: {
  product: string;
  markupType: 'percent' | 'flat';
  markupPercent: number;
  markupFlatCents: number;
  minPriceCents: number;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('service_pricing').upsert({
    product: input.product.trim().toLowerCase(),
    markup_type: input.markupType,
    markup_percent: input.markupPercent,
    markup_flat_cents: input.markupFlatCents,
    min_price_cents: input.minPriceCents,
    active: true,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

/** Removes a product's override — it falls back to the global markup again. */
export async function deleteServiceOverride(product: string) {
  const admin = createAdminClient();
  const { error } = await admin.from('service_pricing').delete().eq('product', product);
  if (error) throw error;
}

/** Applies the current markup to a provider cost, in minor units ("cents"). */
export function applyMarkup(costCents: number, rule: PricingRule): number {
  const marked =
    rule.markupType === 'percent'
      ? Math.round(costCents * (1 + rule.markupPercent / 100))
      : costCents + rule.markupFlatCents;

  return Math.max(marked, rule.minPriceCents);
}
