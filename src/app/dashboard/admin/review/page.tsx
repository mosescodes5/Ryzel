import { redirect } from 'next/navigation';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader, StatusBadge } from '@/components/dashboard/ui';
import { formatNaira } from '@/lib/utils';
import { refundReviewOrder, retryReviewOrder } from './actions';

const STUCK_AFTER_MS = 15 * 60_000;

export default async function DashboardAdminReviewPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();

  const { data } = await admin
    .from('number_orders')
    .select(
      'id, status, product, country, operator, price_cents, provider_order_id, phone_number, review_note, purchase_started_at, created_at'
    )
    .or(`status.eq.needs_review,and(status.eq.purchasing,purchase_started_at.lt.${stuckBefore})`)
    .order('created_at', { ascending: true })
    .limit(100);

  const rows = data ?? [];
  const held = rows.reduce((sum: number, o) => sum + o.price_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orders needing review"
        description="Customers here have paid, but the system could not tell whether 5sim really sold the number. Their money is being held, not lost."
      />

      <DCard>
        <p className="text-sm text-slate-600">
          {rows.length === 0 ? (
            'Nothing needs review right now.'
          ) : (
            <>
              <span className="font-medium text-slate-900">{rows.length}</span> order(s) holding{' '}
              <span className="font-medium text-slate-900">{formatNaira(held)}</span> of customer money.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Before refunding, open your 5sim order history and look for a purchase of that service and country around the
          time shown. If 5sim DID sell one, refunding means you absorb its cost — use Retry instead and the system will
          pick it up.
        </p>
      </DCard>

      {rows.map((order) => (
        <DCard key={order.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <p className="font-medium text-slate-900">
                {order.product ?? 'service'} · {order.country ?? '—'}
              </p>
              <StatusBadge status={order.status} />
            </div>
            <p className="font-mono text-sm text-slate-800">{formatNaira(order.price_cents)}</p>
          </div>

          <dl className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
            <div>Order id: <span className="font-mono">{order.id}</span></div>
            <div>Started: {new Date(order.purchase_started_at ?? order.created_at).toLocaleString('en-NG')}</div>
            <div>Provider order: <span className="font-mono">{order.provider_order_id ?? 'none recorded'}</span></div>
            <div>Operator pool: {order.operator ?? '—'}</div>
          </dl>
          {order.review_note && <p className="text-xs text-amber-700">{order.review_note}</p>}

          <div className="flex gap-2">
            <form
              action={async () => {
                'use server';
                await refundReviewOrder(order.id);
              }}
            >
              <DButton type="submit" variant="secondary">Refund customer</DButton>
            </form>
            {order.status === 'needs_review' && (
              <form
                action={async () => {
                  'use server';
                  await retryReviewOrder(order.id);
                }}
              >
                <DButton type="submit" variant="secondary">Retry automatic check</DButton>
              </form>
            )}
          </div>
        </DCard>
      ))}
    </div>
  );
}
