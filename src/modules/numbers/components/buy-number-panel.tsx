'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Smartphone, ShieldCheck } from 'lucide-react';
import { DCard, DButton } from '@/components/dashboard/ui';
import { formatCents, cn } from '@/lib/utils';

type Country = { code: string; name: string };
type Service = { product: string; operator: string; priceCents: number; quantity: number };
type Offer = { operator: string; priceCents: number; successRate: number | null; quantity: number };

function formatOperatorLabel(operator: string) {
  if (!operator || operator === 'any') return 'Standard';
  return operator.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function successRateTone(rate: number | null) {
  if (rate == null) return 'bg-slate-100 text-slate-600';
  if (rate >= 70) return 'bg-emerald-50 text-emerald-700';
  if (rate >= 40) return 'bg-amber-50 text-amber-700';
  return 'bg-rose-50 text-rose-700';
}

export function BuyNumberPanel() {
  const router = useRouter();

  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [country, setCountry] = useState('');

  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [product, setProduct] = useState('');

  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [reservingOperator, setReservingOperator] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Load countries once, from 5sim.
  useEffect(() => {
    let cancelled = false;
    setLoadingCountries(true);
    setCountriesError(null);

    fetch('/api/v1/numbers/countries')
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setCountriesError(body.error);
          return;
        }
        setCountries(body.data);
      })
      .catch(() => !cancelled && setCountriesError('Could not load countries'))
      .finally(() => !cancelled && setLoadingCountries(false));

    return () => {
      cancelled = true;
    };
  }, []);

  // Load services for the selected country, from 5sim.
  useEffect(() => {
    if (!country) {
      setServices([]);
      setProduct('');
      return;
    }

    let cancelled = false;
    setLoadingServices(true);
    setServicesError(null);
    setServices([]);
    setProduct('');
    setOffers(null);
    setOffersError(null);
    setBuyError(null);

    fetch(`/api/v1/numbers/products?country=${country}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) {
          setServicesError(body.error);
          return;
        }
        setServices(body.data);
      })
      .catch(() => !cancelled && setServicesError('Could not load services'))
      .finally(() => !cancelled && setLoadingServices(false));

    return () => {
      cancelled = true;
    };
  }, [country]);

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCountry(e.target.value);
  }

  function handleProductChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setProduct(e.target.value);
    setOffers(null);
    setOffersError(null);
    setBuyError(null);
  }

  async function handleCheckAvailability() {
    if (!country || !product) return;

    setLoadingOffers(true);
    setOffersError(null);
    setBuyError(null);
    setOffers(null);

    try {
      const res = await fetch(`/api/v1/numbers/offers?country=${country}&product=${product}`);
      const body = await res.json();
      if (!res.ok) {
        setOffersError(body.error ?? 'Could not check availability');
        return;
      }
      setOffers(body.data);
      if (body.data.length === 0) {
        setOffersError('No numbers currently available for this service.');
      }
    } catch {
      setOffersError('Could not check availability');
    } finally {
      setLoadingOffers(false);
    }
  }

  async function handleReserve(operator: string) {
    setReservingOperator(operator);
    setBuyError(null);

    const res = await fetch('/api/v1/numbers/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, operator, product })
    });
    const body = await res.json();

    setReservingOperator(null);
    if (!res.ok) {
      setBuyError(body.error ?? 'Purchase failed');
      return;
    }

    router.push('/dashboard/orders');
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DCard>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">Get a Virtual Number</p>
            <p className="text-xs text-slate-500">
              Charged when a number is assigned; automatically refunded if no SMS arrives.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500">Select Country</label>
            <div className="relative mt-1">
              {countries.length > 6 && (
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              )}
              <select
                value={country}
                onChange={handleCountryChange}
                disabled={loadingCountries || countries.length === 0}
                className={cn(
                  'w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pr-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
                  countries.length > 6 ? 'pl-9' : 'pl-3'
                )}
              >
                <option value="">
                  {loadingCountries
                    ? 'Loading countries…'
                    : countries.length === 0
                      ? 'No countries available'
                      : 'Choose a country…'}
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {countriesError && <p className="mt-1.5 text-xs text-rose-600">{countriesError}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Select Service</label>
            <select
              value={product}
              onChange={handleProductChange}
              disabled={!country || loadingServices || services.length === 0}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {!country && <option value="">Select a country first</option>}
              {country && loadingServices && <option value="">Loading services…</option>}
              {country && !loadingServices && services.length === 0 && (
                <option value="">No services available</option>
              )}
              {country && !loadingServices && services.length > 0 && (
                <option value="">Choose a service…</option>
              )}
              {services.map((s) => (
                <option key={s.product} value={s.product}>
                  {s.product.charAt(0).toUpperCase() + s.product.slice(1)} — {s.quantity} available
                </option>
              ))}
            </select>
            {servicesError && <p className="mt-1.5 text-xs text-rose-600">{servicesError}</p>}
          </div>

          <DButton
            className="w-full"
            onClick={handleCheckAvailability}
            disabled={!country || !product || loadingOffers || loadingCountries || loadingServices}
          >
            <Search className="h-4 w-4" /> {loadingOffers ? 'Checking…' : 'Check Availability'}
          </DButton>

          {offersError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {offersError}
            </p>
          )}
          {buyError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {buyError}
            </p>
          )}
        </div>
      </DCard>

      {offers && offers.length > 0 && (
        <DCard>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            <p className="text-sm font-medium text-slate-900">Available Numbers</p>
          </div>

          <div className="flex flex-col gap-3">
            {offers.map((offer) => (
              <div
                key={offer.operator}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{formatOperatorLabel(offer.operator)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      Price <span className="font-mono font-medium text-slate-800">{formatCents(offer.priceCents)}</span>
                    </span>
                    {offer.successRate != null && (
                      <span className={cn('rounded-full px-2 py-0.5 font-medium', successRateTone(offer.successRate))}>
                        {Math.round(offer.successRate)}% success rate
                      </span>
                    )}
                    <span>{offer.quantity} available</span>
                  </div>
                </div>
                <DButton
                  variant="success"
                  onClick={() => handleReserve(offer.operator)}
                  disabled={reservingOperator !== null}
                >
                  {reservingOperator === offer.operator ? 'Reserving…' : 'Reserve'}
                </DButton>
              </div>
            ))}
          </div>
        </DCard>
      )}
    </div>
  );
}
