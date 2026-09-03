'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';

export async function updateSiteSettings(formData: FormData) {
  await requireAdmin();

  const raw = String(formData.get('whatsapp_group_link') ?? '').trim();

  // Allow clearing the link (empty string -> null) so the dashboard promo
  // card hides itself instead of linking to a blank href.
  const whatsappGroupLink = raw.length === 0 ? null : raw;

  if (whatsappGroupLink && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(whatsappGroupLink)) {
    throw new Error('Link must be a WhatsApp invite link (https://chat.whatsapp.com/... or https://wa.me/...)');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('site_settings')
    .update({
      whatsapp_group_link: whatsappGroupLink,
      updated_at: new Date().toISOString()
    })
    .eq('id', true);

  if (error) throw error;

  revalidatePath('/admin/settings');
  revalidatePath('/dashboard');
}
