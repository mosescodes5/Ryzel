import { redirect } from 'next/navigation';
import { Wallet, Receipt, TrendingUp } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, PageHeader, StatusBadge } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';

export default async function DashboardAdminOrdersPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const { data: orders } = await admin
    .from('number_orders')
    .select('id, phone_number, product, country, status, price_cents, cost_cents, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  const rows = orders ?? [];
  const totalRevenue = rows.reduce((sum: number, o) => sum + o.price_cents, 0);
  const totalCost = rows.reduce((sum: number, o) => sum + o.cost_cents, 0);
  const totalProfit = totalRevenue - totalCost;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Orders & profit" description="Every number sold, with what it cost and what it earned." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Revenue (charged to customers)</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatCents(totalRevenue)}</p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Cost (paid to 5Sim)</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatCents(totalCost)}</p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4 border-emerald-200 bg-emerald-50/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-emerald-700">Profit</p>
            <p className="mt-0.5 text-lg font-semibold text-emerald-700">{formatCents(totalProfit)}</p>
          </div>
        </DCard>
      </div>

      <DCard className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Number</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Charged</th>
                  <th className="px-5 py-3 font-medium">Cost</th>
                  <th className="px-5 py-3 font-medium">Profit</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => {
                  const profit = order.price_cents - order.cost_cents;
                  return (
                    <tr key={order.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-800">
                        {order.phone_number ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-slate-500">{order.product ?? '—'}</td>
                      <td className="px-5 py-3.5 text-slate-500">{order.country ?? '—'}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-800">
                        {formatCents(order.price_cents)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">
                        {formatCents(order.cost_cents)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-3.5 font-medium ${
                          profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatCents(profit)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DCard>
    </div>
  );
}
