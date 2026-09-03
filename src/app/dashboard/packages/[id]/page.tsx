import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Plus } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { getPackageByIdForUser, publicTrackingUrl, PACKAGE_STATUSES } from '@/lib/packages/package-service';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { addPackageEventAction } from '../actions';

function statusLabel(status: string) {
  return PACKAGE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export default async function DashboardPackageDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getCurrentUserWithRole();
  if (!user) redirect('/login');

  const result = await getPackageByIdForUser(params.id, user.id);
  if (!result) notFound();
  const { pkg, events } = result;

  const publicUrl = publicTrackingUrl(pkg.tracking_number);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/packages"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All tracking numbers
        </Link>
        <PageHeader
          title={pkg.tracking_number}
          description={`Currently: ${statusLabel(pkg.status)}. Public link — share this with the customer:`}
        />
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block break-all font-mono text-sm text-brand-600 hover:text-brand-700 hover:underline"
        >
          {publicUrl}
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DCard>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Plus className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-slate-900">Add a status update</p>
            </div>
            <form action={addPackageEventAction} className="flex flex-col gap-4">
              <input type="hidden" name="package_id" value={pkg.id} />
              <div>
                <label className="text-xs font-medium text-slate-500">Status</label>
                <select
                  name="status"
                  defaultValue={pkg.status}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  {PACKAGE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Location (optional)</label>
                <input
                  type="text"
                  name="location"
                  placeholder="e.g. Lagos sorting facility"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Note (optional)</label>
                <input
                  type="text"
                  name="note"
                  placeholder="Shown to the customer on the tracking page"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <DButton type="submit">Add update</DButton>
            </form>
          </DCard>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Timeline</h2>
            <DCard className="p-0">
              <ul className="divide-y divide-slate-50">
                {[...events].reverse().map((event) => (
                  <li key={event.id} className="flex items-start gap-3 px-5 py-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{statusLabel(event.status)}</p>
                      {event.location && <p className="text-xs text-slate-500">{event.location}</p>}
                      {event.note && <p className="mt-0.5 text-sm text-slate-600">{event.note}</p>}
                      <p className="mt-1 text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </DCard>
          </div>
        </div>

        <DCard className="h-fit">
          <p className="mb-3 text-sm font-medium text-slate-900">Package details</p>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">Customer</dt>
              <dd className="mt-0.5 text-slate-800">{pkg.customer_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Email</dt>
              <dd className="mt-0.5 text-slate-800">{pkg.customer_email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Phone</dt>
              <dd className="mt-0.5 text-slate-800">{pkg.customer_phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Description</dt>
              <dd className="mt-0.5 text-slate-800">{pkg.description || '—'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs font-medium text-slate-500">Origin</dt>
                <dd className="mt-0.5 text-slate-800">{pkg.origin || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Destination</dt>
                <dd className="mt-0.5 text-slate-800">{pkg.destination || '—'}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Estimated delivery</dt>
              <dd className="mt-0.5 text-slate-800">
                {pkg.estimated_delivery ? new Date(pkg.estimated_delivery).toLocaleDateString() : '—'}
              </dd>
            </div>
          </dl>
        </DCard>
      </div>
    </div>
  );
}
