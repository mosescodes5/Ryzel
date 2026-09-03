'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';

export async function toggleServiceActive(serviceId: string, nextActive: boolean) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from('services')
    .update({ active: nextActive, updated_at: new Date().toISOString() })
    .eq('id', serviceId);

  if (error) throw error;

  revalidatePath('/dashboard/admin/services');
  revalidatePath('/');
  revalidatePath('/marketplace');
}
