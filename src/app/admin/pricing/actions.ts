'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';

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
      markup_type: markupType,
      markup_percent: markupPercent,
      markup_flat_cents: markupFlatCents,
      min_price_cents: minPriceCents,
      updated_at: new Date().toISOString()
    })
    .eq('id', true);

  if (error) throw error;

  revalidatePath('/admin/pricing');
  revalidatePath('/marketplace/numbers');
}
