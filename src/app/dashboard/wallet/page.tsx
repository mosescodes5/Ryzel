'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';

// Plain naira — no kobo conversion anywhere in this flow.
const PRESET_AMOUNTS = [100, 500, 1000];

const MIN_AMOUNT_NAIRA = 50; // must match MIN_TOPUP_CENTS in api/v1/wallet/topup/route.ts

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

  const [amount, setAmount] = useState(PRESET_AMOUNTS[1]);
  const [customValue, setCustomValue] = useState('');
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

  function selectPreset(preset: number) {
    setAmount(preset);
    setCustomValue('');
    setError(null);
  }

  function handleCustomChange(value: string) {
    setCustomValue(value);
    const parsed = Number(value);
    if (value.trim() !== '' && !Number.isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
      setError(null);
    }
  }

  const isCustomActive = customValue.trim() !== '';
  const isBelowMinimum = amount < MIN_AMOUNT_NAIRA;

  async function handleTopUp() {
    if (isBelowMinimum) {
      setError(`Minimum top-up is ${MIN_AMOUNT_NAIRA.toFixed(2)}`);
      return;
    }

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
              onClick={() => selectPreset(preset)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                !isCustomActive && amount === preset
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {preset.toFixed(2)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label htmlFor="custom-amount" className="mb-1.5 block text-xs font-medium text-slate-500">
            Or enter a custom amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              ₦
            </span>
            <input
              id="custom-amount"
              type="number"
              min={MIN_AMOUNT_NAIRA}
              step="0.01"
              inputMode="decimal"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder={`e.g. ${MIN_AMOUNT_NAIRA}`}
              className={`w-full rounded-lg border py-2.5 pl-7 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 ${
                isCustomActive ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200'
              }`}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <DButton className="mt-5 w-full" onClick={handleTopUp} disabled={loading || isBelowMinimum}>
          {loading ? 'Redirecting to Korapay…' : `Pay ${amount.toFixed(2)} with Korapay`}
        </DButton>
      </DCard>
    </div>
  );
}