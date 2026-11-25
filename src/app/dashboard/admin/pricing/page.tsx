import { redirect } from 'next/navigation';
import { Tag, Plus, Trash2, Coins } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { listServiceOverrides, applyMarkup, type PricingRule } from '@/lib/pricing/number-pricing';
import { getActivationProvider } from '@/modules/numbers/providers/activation-provider-manager';
import { formatNaira } from '@/lib/utils';
import { getFxSetting } from '@/lib/pricing/fx-rate';
import { updatePricing, saveServiceOverride, removeServiceOverride, updateFxRate } from './actions';

// Reference country used only to show admins roughly what 5Sim currently
// charges for a product — actual cost is re-quoted live per country at
// purchase time, so this is a helper for setting sensible margins, not
// the number that gets charged.
const REFERENCE_COUNTRY = 'usa';

async function getReferenceCosts(): Promise<Record<string, number>> {
  try {
    const provider = getActivationProvider();
    const products = await provider.listProducts({ country: REFERENCE_COUNTRY });
    return Object.fromEntries(products.map((p) => [p.product, p.costNaira]));
  } catch {
    // 5sim can be briefly unreachable — the page still works, just without
    // the reference cost column.
    return {};
  }
}

export default async function DashboardPricingPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const [{ data: pricing }, overrides, referenceCosts, fx, { data: summary }] = await Promise.all([
    admin.from('number_pricing').select('*').eq('id', true).single(),
    listServiceOverrides(),
    getReferenceCosts(),
    getFxSetting(),
    admin.rpc('admin_profit_summary')
  ]);

  const periods = Object.fromEntries((summary ?? []).map((r) => [r.period, r]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pricing"
        description="Set what customers pay on top of what 5Sim charges you. A per-service price overrides the global markup for that one service; everything else uses the global rule."
      />


      <DCard className="max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Coins className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">Dollar rate (5sim cost to naira)</p>
            <p className="text-xs text-slate-500">
              5sim prices are not in naira. This rate turns them into your cost in naira, and your markup goes on top.
            </p>
          </div>
        </div>

        {fx.rate === null ? (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            No rate set: customers cannot buy numbers until you save one below.
          </p>
        ) : (
          <p className="mb-4 text-sm text-slate-700">
            Current: <span className="font-medium text-slate-900">1 {fx.currency} = {formatNaira(fx.rate)}</span>
            {fx.source === 'env' && <span className="text-xs text-slate-500"> (from a server setting; save one here to override it)</span>}
            {fx.updatedAt && fx.source === 'admin' && (
              <span className="text-xs text-slate-500"> · changed {new Date(fx.updatedAt).toLocaleString('en-NG')}</span>
            )}
          </p>
        )}

        <form action={updateFxRate} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-500">5sim bills you in</label>
            <input
              name="fx_currency"
              defaultValue={fx.currency}
              maxLength={8}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500">Naira per 1 unit of that currency</label>
            <input
              name="fx_rate"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={fx.rate ?? ''}
              placeholder="e.g. 1520"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-3">
            <input type="checkbox" name="confirm_big_change" />
            This is more than 25% different from the current rate, and it is correct.
          </label>
          <p className="text-xs text-slate-500 sm:col-span-3">
            Enter what it costs YOU, in naira, to put 1 unit into your 5sim balance, plus a small buffer for the rate
            moving. A rate that is too low means your markup quietly pays for the difference. Changes apply to new
            purchases within seconds; orders already bought keep the cost they were bought at.
          </p>
          <div className="sm:col-span-3">
            <DButton type="submit">Save rate</DButton>
          </div>
        </form>
      </DCard>

      <DCard className="max-w-2xl">
        <p className="mb-1 text-sm font-medium text-slate-900">Your profit</p>
        <p className="mb-4 text-xs text-slate-500">
          Only orders that delivered a code count. Refunded, cancelled and expired orders earn nothing. Profit = what
          customers paid minus what 5sim charged you.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Period</th>
              <th className="pb-2 text-right font-medium">Orders</th>
              <th className="pb-2 text-right font-medium">Revenue</th>
              <th className="pb-2 text-right font-medium">5sim cost</th>
              <th className="pb-2 text-right font-medium">Profit</th>
              <th className="pb-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['today', 'Today'],
                ['last_7_days', 'Last 7 days'],
                ['last_30_days', 'Last 30 days'],
                ['all_time', 'All time']
              ] as const
            ).map(([key, label]) => {
              const r = periods[key];
              const revenue = r?.revenue ?? 0;
              const cost = r?.cost ?? 0;
              const profit = revenue - cost;
              return (
                <tr key={key} className="border-t border-slate-100">
                  <td className="py-2 text-slate-700">{label}</td>
                  <td className="py-2 text-right font-mono text-slate-700">{r?.orders ?? 0}</td>
                  <td className="py-2 text-right font-mono text-slate-700">{formatNaira(revenue)}</td>
                  <td className="py-2 text-right font-mono text-slate-700">{formatNaira(cost)}</td>
                  <td className={`py-2 text-right font-mono font-medium ${profit < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatNaira(profit)}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-700">
                    {revenue > 0 ? `${Math.round((profit / revenue) * 100)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Paid but not delivered yet: {periods.held?.orders ?? 0} order(s) holding{' '}
          {formatNaira(periods.held?.revenue ?? 0)}. That is not profit until a code arrives; it is refunded if none does.
        </p>
      </DCard>

      <DCard className="max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Tag className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">Global markup</p>
            <p className="text-xs text-slate-500">Applies to every service without its own override</p>
          </div>
        </div>

        <form action={updatePricing} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500">Markup type</label>
            <select
              name="markup_type"
              defaultValue={pricing?.markup_type ?? 'percent'}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="percent">Percent on top of cost</option>
              <option value="flat">Flat amount on top of cost</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">
              Markup percent (used when type = percent)
            </label>
            <input
              type="number"
              step="0.1"
              name="markup_percent"
              defaultValue={pricing?.markup_percent ?? 40}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">
              Flat markup, in naira (used when type = flat)
            </label>
            <input
              type="number"
              name="markup_flat_cents"
              defaultValue={pricing?.markup_flat_cents ?? 0}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Minimum sale price, in naira</label>
            <input
              type="number"
              name="min_price_cents"
              defaultValue={pricing?.min_price_cents ?? 50}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <DButton type="submit">Save global markup</DButton>
        </form>
      </DCard>

      <div>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Per-service pricing</h2>
          <p className="text-sm text-slate-500">
            Give a specific service (e.g. <span className="font-medium">whatsapp</span>,{' '}
            <span className="font-medium">telegram</span>) its own markup instead of the global default.
            Reference cost below is 5Sim&apos;s current price for {REFERENCE_COUNTRY.toUpperCase()} — actual
            cost is re-quoted per country when a customer buys.
          </p>
        </div>

        <DCard className="p-0">
          {overrides.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No per-service overrides yet — every service is using the global markup.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Reference cost</th>
                  <th className="px-5 py-3 font-medium">Markup</th>
                  <th className="px-5 py-3 font-medium">Reference sell price</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {overrides.map((override) => {
                  const refCost = referenceCosts[override.product];
                  const rule: PricingRule = override;
                  return (
                    <tr key={override.product} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3.5 font-medium capitalize text-slate-800">{override.product}</td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {refCost !== undefined ? formatNaira(refCost) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {override.markupType === 'percent'
                          ? `+${override.markupPercent}%`
                          : `+${formatNaira(override.markupFlatCents)} flat`}
                        {' · min '}
                        {formatNaira(override.minPriceCents)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-emerald-600">
                        {refCost !== undefined ? formatNaira(applyMarkup(refCost, rule)) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <form action={removeServiceOverride}>
                          <input type="hidden" name="product" value={override.product} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DCard>

        <DCard className="mt-4 max-w-md">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Plus className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-slate-900">Add or update a service price</p>
          </div>

          <form action={saveServiceOverride} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Service (5Sim product slug)</label>
              <input
                type="text"
                name="product"
                placeholder="e.g. whatsapp"
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Markup type</label>
              <select
                name="markup_type"
                defaultValue="percent"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="percent">Percent on top of cost</option>
                <option value="flat">Flat amount on top of cost</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Markup percent</label>
              <input
                type="number"
                step="0.1"
                name="markup_percent"
                defaultValue={50}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Flat markup, in naira</label>
              <input
                type="number"
                name="markup_flat_cents"
                defaultValue={0}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Minimum sale price, in naira</label>
              <input
                type="number"
                name="min_price_cents"
                defaultValue={pricing?.min_price_cents ?? 50}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <DButton type="submit">Save service price</DButton>
          </form>
        </DCard>
      </div>
    </div>
  );
}
