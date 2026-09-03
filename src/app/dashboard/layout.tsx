import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { Sidebar } from '@/components/dashboard/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { user, role } = await getCurrentUserWithRole();

  if (!user) redirect('/login');

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, email, wallet_balance_cents')
      .eq('id', user.id)
      .single(),
    supabase.from('site_settings').select('whatsapp_group_link').eq('id', true).single()
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        displayName={profile?.display_name ?? null}
        email={profile?.email ?? user.email ?? ''}
        walletBalanceCents={profile?.wallet_balance_cents ?? 0}
        role={role ?? 'user'}
        whatsappGroupLink={settings?.whatsapp_group_link ?? null}
      />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
