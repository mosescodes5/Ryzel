'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyPhoneSchema, parseOrError } from '@/lib/validation/schemas';

export async function updateNotifyPhone(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');

  const parsed = parseOrError(notifyPhoneSchema, {
    notify_phone_number: String(formData.get('notify_phone_number') ?? '').trim()
  });
  if (!parsed.success) throw new Error(parsed.error);

  const { error } = await supabase
    .from('profiles')
    .update({ notify_phone_number: parsed.data.notify_phone_number || null, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) throw error;

  revalidatePath('/dashboard/account');
}
