import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users, Receipt, Layers, TrendingUp, ArrowUpRight, Wallet } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader, StatusBadge } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';

export default async function DashboardAdminOverviewPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();

  const [{ count: userCount }, { count: orderCount }, { count: serviceCount }, { data: allOrders }] =
    await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('number_orders').select('*', { count: 'exact', head: true }),
      admin.from('services').select('*', { count: 'exact', head: true }).eq('active', true),
      admin
        .from('number_orders')
        .select('id, phone_number, product, country, status, price_cents, cost_cents, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
    ]);

  const rows = allOrders ?? [];
  const totalRevenue = rows.reduce((sum: number, o) => sum + o.price_cents, 0);
  const totalCost = rows.reduce((sum: number, o) => sum + o.cost_cents, 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const recentOrders = rows.slice(0, 6);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Admin overview"
        description="Revenue, cost, and profit across every number sold on the platform."
        action={
          <Link href="/dashboard/admin/pricing">
            <DButton>
              <TrendingUp className="h-4 w-4" /> Manage pricing
            </DButton>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Total revenue</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatCents(totalRevenue)}</p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Provider cost</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatCents(totalCost)}</p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4 border-emerald-200 bg-emerald-50/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-emerald-700">Total profit</p>
            <p className="mt-0.5 text-lg font-semibold text-emerald-700">
              {formatCents(totalProfit)}{' '}
              <span className="text-xs font-normal text-emerald-600">({margin.toFixed(1)}% margin)</span>
            </p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Users</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{userCount ?? 0}</p>
          </div>
        </DCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DCard className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">{orderCount ?? 0} orders</p>
              <p className="text-xs text-slate-500">All-time number purchases</p>
            </div>
          </div>
          <Link href="/dashboard/admin/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" />
          </Link>
        </DCard>
        <DCard className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">{serviceCount ?? 0} active services</p>
              <p className="text-xs text-slate-500">Enabled marketplace tools</p>
            </div>
          </div>
          <Link href="/dashboard/admin/services" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Manage <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" />
          </Link>
        </DCard>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent orders</h2>
          <Link href="/dashboard/admin/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        <DCard className="p-0">
          {recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No orders yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Number</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Charged</th>
                  <th className="px-5 py-3 font-medium">Cost</th>
                  <th className="px-5 py-3 font-medium">Profit</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const profit = order.price_cents - order.cost_cents;
                  return (
                    <tr key={order.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3.5 font-medium text-slate-800">{order.phone_number ?? '—'}</td>
                      <td className="px-5 py-3.5 capitalize text-slate-500">{order.product ?? '—'}</td>
                      <td className="px-5 py-3.5 text-slate-800">{formatCents(order.price_cents)}</td>
                      <td className="px-5 py-3.5 text-slate-500">{formatCents(order.cost_cents)}</td>
                      <td className={`px-5 py-3.5 font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCents(profit)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DCard>
      </div>
    </div>
  );
}
