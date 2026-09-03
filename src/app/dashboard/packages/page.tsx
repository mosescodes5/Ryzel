import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package as PackageIcon, Plus } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { listPackagesForUser, PACKAGE_STATUSES } from '@/lib/packages/package-service';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { createPackageAction } from './actions';

function statusLabel(status: string) {
  return PACKAGE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function statusColor(status: string) {
  switch (status) {
    case 'delivered':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'delayed':
    case 'exception':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 ring-slate-200';
    default:
      return 'bg-sky-50 text-sky-700 ring-sky-200';
  }
}

export default async function DashboardPackagesPage() {
  const { user } = await getCurrentUserWithRole();
  if (!user) redirect('/login');

  const packages = await listPackagesForUser(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Package tracker"
        description="Create a tracking number for a shipment and update its status yourself — anyone with the link can look it up, no login required."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DCard className="p-0">
            {packages.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No tracking numbers yet — create your first one on the right.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-medium">Tracking #</th>
                    <th className="px-5 py-3 font-medium">Route</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/packages/${pkg.id}`}
                          className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          {pkg.tracking_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {pkg.origin || '—'} → {pkg.destination || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusColor(pkg.status)}`}
                        >
                          {statusLabel(pkg.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                        {new Date(pkg.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DCard>
        </div>

        <DCard className="h-fit">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Plus className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-slate-900">New tracking number</p>
          </div>

          <form action={createPackageAction} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Customer name</label>
              <input
                type="text"
                name="customer_name"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Customer email</label>
              <input
                type="email"
                name="customer_email"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Customer phone</label>
              <input
                type="text"
                name="customer_phone"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Description</label>
              <input
                type="text"
                name="description"
                placeholder="e.g. 1x carton, electronics"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Origin</label>
                <input
                  type="text"
                  name="origin"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Destination</label>
                <input
                  type="text"
                  name="destination"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Estimated delivery</label>
              <input
                type="date"
                name="estimated_delivery"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <DButton type="submit">
              <PackageIcon className="h-4 w-4" /> Create & get tracking number
            </DButton>
          </form>
        </DCard>
      </div>
    </div>
  );
}
