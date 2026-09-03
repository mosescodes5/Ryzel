import { redirect } from 'next/navigation';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, PageHeader } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';

export default async function DashboardAdminUsersPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const { data: users } = await admin
    .from('profiles')
    .select('id, email, display_name, role, wallet_balance_cents, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = users ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description={`${rows.length} registered ${rows.length === 1 ? 'user' : 'users'}.`} />

      <DCard className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Wallet balance</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3.5 font-medium text-slate-800">{u.display_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                          : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-800">{formatCents(u.wallet_balance_cents)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DCard>
    </div>
  );
}
