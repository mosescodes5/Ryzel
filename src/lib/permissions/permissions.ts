import type { User } from '@supabase/supabase-js';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function getCurrentUserWithRole(): Promise<{ user: User | null; role: 'user' | 'admin' | null }> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { user: null, role: null };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  let role = (profile?.role ?? 'user') as 'user' | 'admin';

  // Self-heals: an email listed in ADMIN_EMAILS gets promoted the next time
  // they load a page, instead of needing a manual `update profiles set
  // role = 'admin'` after every fresh deploy.
  if (role !== 'admin' && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    const admin = createAdminClient();
    await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id);
    role = 'admin';
  }

  return { user, role };
}

export async function requireAdmin() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user || role !== 'admin') {
    throw new Error('Forbidden: admin access required');
  }
  return user;
}
