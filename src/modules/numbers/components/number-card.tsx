'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/utils';

type Props = {
  id: string;
  phoneNumber: string;
  countryCode: string;
  monthlyPriceCents: number;
};

export function NumberCard({ id, phoneNumber, countryCode, monthlyPriceCents }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/v1/numbers/${id}/purchase`, { method: 'POST' });
    const body = await res.json();

    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? 'Purchase failed');
      return;
    }
    router.push('/dashboard/orders');
    router.refresh();
  }

  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-slate-900">{phoneNumber}</p>
        <p className="text-sm text-slate-500">{countryCode} · {formatCents(monthlyPriceCents)}/mo</p>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>
      <Button onClick={handlePurchase} disabled={loading}>
        {loading ? 'Purchasing…' : 'Buy'}
      </Button>
    </Card>
  );
}
