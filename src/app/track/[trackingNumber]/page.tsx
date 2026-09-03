import Link from 'next/link';
import { ArrowLeft, MapPin, PackageX } from 'lucide-react';
import { TrackHeader } from '@/components/track/track-header';
import { TrackSearchBox } from '@/components/track/track-search-box';
import { getPackageByTrackingNumber, PACKAGE_STATUSES } from '@/lib/packages/package-service';

function statusLabel(status: string) {
  return PACKAGE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function statusColor(status: string) {
  switch (status) {
    case 'delivered':
      return 'bg-signal-500/10 text-signal-400 ring-signal-500/30';
    case 'delayed':
    case 'exception':
    case 'cancelled':
      return 'bg-rose-500/10 text-rose-400 ring-rose-500/30';
    default:
      return 'bg-ink-700 text-mist-300 ring-ink-600';
  }
}

export default async function TrackResultPage(props: { params: Promise<{ trackingNumber: string }> }) {
  const params = await props.params;
  const result = await getPackageByTrackingNumber(decodeURIComponent(params.trackingNumber));

  return (
    <>
      <TrackHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/track" className="mb-8 inline-flex items-center gap-1.5 text-sm text-mist-500 hover:text-mist-100">
          <ArrowLeft className="h-3.5 w-3.5" /> Track another package
        </Link>

        {!result ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 text-mist-500">
              <PackageX className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-semibold text-mist-100">No package found</h1>
            <p className="mt-1.5 max-w-xs text-sm text-mist-500">
              We couldn&apos;t find a package with that tracking number. Double-check it and try again.
            </p>
            <div className="mt-8 w-full max-w-sm">
              <TrackSearchBox autoFocus={false} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-xs uppercase tracking-wide text-mist-500">
                {result.pkg.tracking_number}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold text-mist-100">
                  {result.pkg.origin || '—'} → {result.pkg.destination || '—'}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusColor(result.pkg.status)}`}
                >
                  {statusLabel(result.pkg.status)}
                </span>
              </div>
              {result.pkg.description && <p className="text-sm text-mist-500">{result.pkg.description}</p>}
              {result.pkg.estimated_delivery && (
                <p className="text-sm text-mist-500">
                  Estimated delivery: {new Date(result.pkg.estimated_delivery).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className="mt-10">
              <h2 className="mb-4 text-sm font-semibold text-mist-100">Delivery history</h2>
              <ol className="flex flex-col gap-6 border-l border-ink-700 pl-6">
                {[...result.events].reverse().map((event, i) => (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-ink-950 ${
                        i === 0 ? 'bg-signal-500' : 'bg-ink-600'
                      }`}
                    >
                      {i === 0 && <MapPin className="h-2.5 w-2.5 text-ink-950" />}
                    </span>
                    <p className="text-sm font-medium text-mist-100">{statusLabel(event.status)}</p>
                    {event.location && <p className="text-xs text-mist-500">{event.location}</p>}
                    {event.note && <p className="mt-1 text-sm text-mist-300">{event.note}</p>}
                    <p className="mt-1 text-xs text-mist-500">{new Date(event.created_at).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </main>
    </>
  );
}
