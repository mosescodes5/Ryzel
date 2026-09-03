'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

export default function TopupCompletePage() {
  return (
    <Suspense fallback={null}>
      <TopupCompleteContent />
    </Suspense>
  );
}

function TopupCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');
  const [status, setStatus] = useState<'checking' | 'succeeded' | 'pending' | 'failed' | 'error'>('checking');

  useEffect(() => {
    if (!reference) {
      setStatus('error');
      return;
    }

    fetch(`/api/v1/wallet/verify?reference=${reference}`)
      .then((res) => res.json())
      .then((body) => setStatus(body.data?.status ?? 'pending'))
      .catch(() => setStatus('error'));
  }, [reference]);

  useEffect(() => {
    if (status === 'succeeded' || status === 'failed') {
      const timer = setTimeout(() => router.push('/dashboard/wallet'), 2000);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <Card className="w-full">
        {status === 'checking' && <p className="text-sm text-slate-500">Confirming your payment…</p>}
        {status === 'succeeded' && (
          <p className="text-sm text-emerald-600">Payment confirmed — redirecting to your wallet…</p>
        )}
        {status === 'pending' && (
          <p className="text-sm text-amber-600">
            Still processing. Redirecting you to your wallet, where this will update once confirmed.
          </p>
        )}
        {(status === 'failed' || status === 'error') && (
          <p className="text-sm text-rose-600">This payment didn't go through. Redirecting…</p>
        )}
      </Card>
    </main>
  );
}
