'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, XCircle, Copy } from 'lucide-react';
import { DCard, DButton, StatusBadge, PageHeader } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';

type Order = {
  id: string;
  phone_number: string | null;
  product: string | null;
  country: string | null;
  status: string;
  price_cents: number;
  created_at: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/v1/orders')
      .then((res) => res.json())
      .then((body) => setOrders(body.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheck(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/v1/numbers/orders/${id}/check`, { method: 'POST' });
    const body = await res.json();
    setBusyId(null);

    if (!res.ok) {
      setError(body.error ?? 'Could not check order');
      return;
    }
    if (body.data.smsCode) {
      setCodes((prev) => ({ ...prev, [id]: body.data.smsCode }));
    }
    load();
  }

  async function handleCancel(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/v1/numbers/orders/${id}/cancel`, { method: 'POST' });
    const body = await res.json();
    setBusyId(null);

    if (!res.ok) {
      setError(body.error ?? 'Could not cancel order');
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Order History" description="Every number you've purchased, and its live status." />
      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      {!loading && orders.length === 0 && (
        <DCard className="py-10 text-center text-sm text-slate-500">No orders yet.</DCard>
      )}

      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <DCard key={order.id} className="overflow-hidden p-0">
            <div className="flex items-center justify-between bg-brand-700 px-5 py-3.5">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-brand-200">Order</p>
                <p className="text-sm font-semibold text-white">#{order.id.slice(0, 8)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-brand-200">Date</p>
                <p className="text-sm font-medium text-white">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Service</p>
                <p className="mt-0.5 font-medium capitalize text-slate-800">{order.product ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Country</p>
                <p className="mt-0.5 font-medium text-slate-800">{order.country ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Price</p>
                <p className="mt-0.5 font-medium text-emerald-600">{formatCents(order.price_cents)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <div className="mt-1">
                  <StatusBadge status={order.status} />
                </div>
              </div>
            </div>

            {order.phone_number && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
                <div>
                  <p className="text-xs text-slate-400">Virtual number</p>
                  <p className="font-mono text-sm font-medium text-slate-800">{order.phone_number}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(order.phone_number ?? '')}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="Copy number"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}

            {codes[order.id] && (
              <p className="border-t border-slate-100 px-5 py-3 text-sm font-medium text-emerald-600">
                Code: {codes[order.id]}
              </p>
            )}

            {order.status === 'awaiting_sms' && (
              <div className="flex gap-2 border-t border-slate-100 px-5 py-3.5">
                <DButton variant="secondary" onClick={() => handleCheck(order.id)} disabled={busyId === order.id}>
                  <RefreshCw className="h-4 w-4" /> {busyId === order.id ? 'Checking…' : 'Check for code'}
                </DButton>
                <DButton variant="ghost" onClick={() => handleCancel(order.id)} disabled={busyId === order.id}>
                  <XCircle className="h-4 w-4" /> Cancel
                </DButton>
              </div>
            )}
          </DCard>
        ))}
      </div>
    </div>
  );
}
