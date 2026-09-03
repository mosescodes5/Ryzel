import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wallet, Smartphone, ClipboardList, MessageCircle, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DCard, DButton, StatusBadge, PageHeader } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';
import { listActivationOrdersForUser } from '@/modules/numbers/services/activation-service';
import { BuyNumberPanel } from '@/modules/numbers/components/buy-number-panel';

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // The layout already redirects unauthenticated visitors, but each page
  // makes its own auth.getUser() call — belt-and-suspenders so a race or a
  // stale/unconfirmed session never null-crashes the page instead of
  // sending the person back to /login.
  if (!user) redirect('/login');

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('wallet_balance_cents, display_name, email')
      .eq('id', user.id)
      .single(),
    supabase.from('site_settings').select('whatsapp_group_link').eq('id', true).single()
  ]);

  const orders = await listActivationOrdersForUser(user.id);
  const activeCount = orders.filter((o) => o.status === 'awaiting_sms' || o.status === 'received').length;
  const recentOrders = orders.slice(0, 5);
  const whatsappGroupLink = settings?.whatsapp_group_link ?? null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={profile?.display_name ? `Welcome back, ${profile.display_name}` : 'Overview'}
        description="Here's what's happening with your numbers today."
        action={
          <Link href="/dashboard/wallet">
            <DButton variant="secondary">
              <Wallet className="h-4 w-4" /> Add Funds
            </DButton>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Wallet balance</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">
              {formatCents(profile?.wallet_balance_cents ?? 0)}
            </p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Active numbers</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{activeCount}</p>
          </div>
        </DCard>
        <DCard className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Total orders</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{orders.length}</p>
          </div>
        </DCard>
      </div>

      <BuyNumberPanel />

      {whatsappGroupLink && (
        <DCard className="flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50/60">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">Join our WhatsApp community</p>
              <p className="text-sm text-slate-500">Get updates, support, and offers.</p>
            </div>
          </div>
          <a href={whatsappGroupLink} target="_blank" rel="noreferrer">
            <DButton variant="success">
              Join now <ArrowUpRight className="h-4 w-4" />
            </DButton>
          </a>
        </DCard>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent orders</h2>
          <Link href="/dashboard/orders" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        <DCard className="p-0">
          {recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No orders yet — buy your first number to get started.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3.5 font-medium capitalize text-slate-800">
                      {order.product ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{order.country ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{formatCents(order.price_cents)}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DCard>
      </div>
    </div>
  );
}
