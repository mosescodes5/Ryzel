'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { upsertServiceOverride, deleteServiceOverride } from '@/lib/pricing/number-pricing';
import { getFxSetting, clearFxRateCache } from '@/lib/pricing/fx-rate';
import { validateFxRateInput, fxChangeNeedsConfirm } from '@/modules/numbers/lib/naira';

export async function updatePricing(formData: FormData) {
  await requireAdmin();

  const markupType = String(formData.get('markup_type'));
  const markupPercent = Number(formData.get('markup_percent'));
  const markupFlatCents = Number(formData.get('markup_flat_cents'));
  const minPriceCents = Number(formData.get('min_price_cents'));

  if (!['percent', 'flat'].includes(markupType)) throw new Error('Invalid markup type');
  if (!Number.isFinite(markupPercent) || !Number.isFinite(markupFlatCents) || !Number.isFinite(minPriceCents)) {
    throw new Error('Invalid pricing values');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('number_pricing')
    .update({
      markup_type: markupType as 'percent' | 'flat',
      markup_percent: markupPercent,
      markup_flat_cents: markupFlatCents,
      min_price_cents: minPriceCents,
      updated_at: new Date().toISOString()
    })
    .eq('id', true);

  if (error) throw error;

  revalidatePath('/dashboard/admin/pricing');
  revalidatePath('/dashboard');
}

/**
 * Sets (or replaces) the markup for a single 5sim product, e.g. "whatsapp".
 * Overrides take priority over the global markup above for that product
 * only — everything else keeps using the global rule.
 */
export async function saveServiceOverride(formData: FormData) {
  await requireAdmin();

  const product = String(formData.get('product') ?? '').trim().toLowerCase();
  const markupType = String(formData.get('markup_type'));
  const markupPercent = Number(formData.get('markup_percent'));
  const markupFlatCents = Number(formData.get('markup_flat_cents'));
  const minPriceCents = Number(formData.get('min_price_cents'));

  if (!product) throw new Error('Service name is required');
  if (!['percent', 'flat'].includes(markupType)) throw new Error('Invalid markup type');
  if (!Number.isFinite(markupPercent) || !Number.isFinite(markupFlatCents) || !Number.isFinite(minPriceCents)) {
    throw new Error('Invalid pricing values');
  }

  await upsertServiceOverride({
    product,
    markupType: markupType as 'percent' | 'flat',
    markupPercent,
    markupFlatCents,
    minPriceCents
  });

  revalidatePath('/dashboard/admin/pricing');
  revalidatePath('/dashboard');
}

/** Removes a per-service override — that product falls back to the global markup. */
export async function removeServiceOverride(formData: FormData) {
  await requireAdmin();

  const product = String(formData.get('product') ?? '').trim().toLowerCase();
  if (!product) throw new Error('Service name is required');

  await deleteServiceOverride(product);

  revalidatePath('/dashboard/admin/pricing');
  revalidatePath('/dashboard');
}

/**
 * Sets the dollar rate: naira per 1 unit of the currency 5sim bills you in.
 * New quotes and purchases use it within seconds. Orders already bought keep
 * the rate they were priced with, so your profit history never rewrites itself.
 */
export async function updateFxRate(formData: FormData) {
  const adminUser = await requireAdmin();

  const rate = validateFxRateInput(formData.get('fx_rate'));
  const currency = String(formData.get('fx_currency') ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new Error('Currency must be letters only, like USD or RUB.');

  const before = await getFxSetting();
  if (fxChangeNeedsConfirm(before.rate, rate) && formData.get('confirm_big_change') !== 'on') {
    throw new Error(
      `That is more than 25% away from the current rate (${before.rate}). If it is correct, go back and tick the confirmation box.`
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('pricing_settings')
    .update({
      fx_rate_ngn_per_unit: rate,
      fx_currency: currency,
      updated_by: adminUser.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', true);
  if (error) throw error;

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: adminUser.id,
    action: 'pricing.fx_rate_change',
    target_type: 'pricing_settings',
    metadata: { previous_rate: before.rate, new_rate: rate, currency }
  });
  if (auditError) console.error('audit log failed for fx rate change', auditError.message);

  clearFxRateCache();
  revalidatePath('/dashboard/admin/pricing');
  revalidatePath('/dashboard');
}
