'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { formatCents } from '@/lib/utils';

const COUNTRIES = [
  { code: 'usa', label: 'United States' },
  { code: 'england', label: 'United Kingdom' },
  { code: 'nigeria', label: 'Nigeria' },
  { code: 'india', label: 'India' },
  { code: 'canada', label: 'Canada' },
  { code: 'germany', label: 'Germany' },
  { code: 'russia', label: 'Russia' }
];

type Quote = { product: string; operator: string; priceCents: number; quantity: number };

export function ActivationPicker() {
  const router = useRouter();
  const [country, setCountry] = useState(COUNTRIES[0].code);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchasingProduct, setPurchasingProduct] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/numbers/products?country=${country}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          setCatalog([]);
        } else {
          setCatalog(body.data);
        }
      })
      .catch(() => !cancelled && setError('Could not load prices'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [country]);

  async function handleBuy(product: string, operator: string) {
    setPurchasingProduct(product);
    setError(null);

    const res = await fetch('/api/v1/numbers/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, operator, product })
    });
    const body = await res.json();

    setPurchasingProduct(null);
    if (!res.ok) {
      setError(body.error ?? 'Purchase failed');
      return;
    }

    router.push('/dashboard/orders');
    router.refresh();
  }

  const filtered = catalog.filter((c) => c.product.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search a service (telegram, whatsapp, google…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading live prices…</p>}

      {!loading && filtered.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 40).map((quote) => (
                <tr key={quote.product} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3.5 font-medium capitalize text-slate-900">{quote.product}</td>
                  <td className="px-4 py-3.5 text-slate-700">{formatCents(quote.priceCents)}</td>
                  <td className="px-4 py-3.5 text-slate-500">{quote.quantity}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => handleBuy(quote.product, quote.operator)}
                      disabled={purchasingProduct === quote.product}
                      className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {purchasingProduct === quote.product ? 'Buying…' : 'Buy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && filtered.length === 0 && !error && (
        <p className="mt-6 text-sm text-slate-500">No services match that search for this country.</p>
      )}
    </div>
  );
}
