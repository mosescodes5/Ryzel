'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';

const PRESET_AMOUNTS = [1000, 2500, 5000, 10000]; // in the smallest currency unit RYZEL stores (e.g. kobo)

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletPageContent />
    </Suspense>
  );
}

function WalletPageContent() {
  const searchParams = useSearchParams();
  const referenceFromRedirect = searchParams.get('reference');

  const [amount, setAmount] = useState(2500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'checking' | 'succeeded' | 'pending' | 'failed' | null>(null);

  useEffect(() => {
    if (!referenceFromRedirect) return;
    setVerifyStatus('checking');
    fetch(`/api/v1/wallet/verify?reference=${referenceFromRedirect}`)
      .then((res) => res.json())
      .then((body) => setVerifyStatus(body.data?.status ?? 'pending'))
      .catch(() => setVerifyStatus('pending'));
  }, [referenceFromRedirect]);

  async function handleTopUp() {
    setLoading(true);
    setError(null);

    const res = await fetch('/api/v1/wallet/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents: amount })
    });
    const body = await res.json();

    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not start payment');
      return;
    }

    window.location.href = body.data.checkoutUrl;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fund Wallet" description="Top up your balance to buy numbers instantly." />

      {verifyStatus && (
        <DCard className="max-w-md">
          {verifyStatus === 'checking' && <p className="text-sm text-slate-500">Confirming your payment…</p>}
          {verifyStatus === 'succeeded' && (
            <p className="text-sm text-emerald-600">Payment confirmed — your balance has been updated.</p>
          )}
          {verifyStatus === 'pending' && (
            <p className="text-sm text-amber-600">
              Still processing on Korapay's side. This page will reflect it once confirmed — you can also
              check your Orders/Account balance in a moment.
            </p>
          )}
          {verifyStatus === 'failed' && <p className="text-sm text-rose-600">This payment didn't go through.</p>}
        </DCard>
      )}

      <DCard className="max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-slate-900">Choose an amount</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_AMOUNTS.map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(preset)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                amount === preset
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {(preset / 100).toFixed(2)}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <DButton className="mt-5 w-full" onClick={handleTopUp} disabled={loading}>
          {loading ? 'Redirecting to Korapay…' : `Pay ${(amount / 100).toFixed(2)} with Korapay`}
        </DButton>
      </DCard>
    </div>
  );
}
