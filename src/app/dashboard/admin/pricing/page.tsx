import { redirect } from 'next/navigation';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { listServiceOverrides, applyMarkup, type PricingRule } from '@/lib/pricing/number-pricing';
import { getActivationProvider } from '@/modules/numbers/providers/activation-provider-manager';
import { formatCents } from '@/lib/utils';
import { updatePricing, saveServiceOverride, removeServiceOverride } from './actions';

// Reference country used only to show admins roughly what 5Sim currently
// charges for a product — actual cost is re-quoted live per country at
// purchase time, so this is a helper for setting sensible margins, not
// the number that gets charged.
const REFERENCE_COUNTRY = 'usa';

async function getReferenceCosts(): Promise<Record<string, number>> {
  try {
    const provider = getActivationProvider();
    const products = await provider.listProducts({ country: REFERENCE_COUNTRY });
    return Object.fromEntries(products.map((p) => [p.product, p.costCents]));
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
  const [{ data: pricing }, overrides, referenceCosts] = await Promise.all([
    admin.from('number_pricing').select('*').eq('id', true).single(),
    listServiceOverrides(),
    getReferenceCosts()
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pricing"
        description="Set what customers pay on top of what 5Sim charges you. A per-service price overrides the global markup for that one service; everything else uses the global rule."
      />

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
              Flat markup, in cents (used when type = flat)
            </label>
            <input
              type="number"
              name="markup_flat_cents"
              defaultValue={pricing?.markup_flat_cents ?? 0}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500">Minimum sale price, in cents</label>
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
                        {refCost !== undefined ? formatCents(refCost) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {override.markupType === 'percent'
                          ? `+${override.markupPercent}%`
                          : `+${formatCents(override.markupFlatCents)} flat`}
                        {' · min '}
                        {formatCents(override.minPriceCents)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-emerald-600">
                        {refCost !== undefined ? formatCents(applyMarkup(refCost, rule)) : '—'}
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
              <label className="text-xs font-medium text-slate-500">Flat markup, in cents</label>
              <input
                type="number"
                name="markup_flat_cents"
                defaultValue={0}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">Minimum sale price, in cents</label>
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
