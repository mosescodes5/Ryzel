import Link from 'next/link';
import { ArrowLeft, MapPin, PackageX } from 'lucide-react';
import { TrackHeader } from '@/components/track/track-header';
import { TrackSearchBox } from '@/components/track/track-search-box';
import { getPackageByTrackingNumber } from '@/lib/packages/package-service';
import { getLocaleAndDictionary } from '@/lib/i18n/get-dictionary';
import type { TrackDictionary } from '@/lib/i18n/i18n-types';

function statusLabel(status: string, dict: TrackDictionary) {
  return dict.status[status as keyof typeof dict.status] ?? status;
}

function statusColor(status: string) {
  switch (status) {
    case 'delivered':
      return 'bg-[#22D3EE]/10 text-[#22D3EE] ring-[#22D3EE]/30';
    case 'delayed':
    case 'exception':
    case 'cancelled':
      return 'bg-rose-500/10 text-rose-400 ring-rose-500/30';
    default:
      return 'bg-white/5 text-[#8B98AC] ring-white/10';
  }
}

export default async function TrackResultPage(props: { params: Promise<{ trackingNumber: string }> }) {
  const params = await props.params;
  const { locale, dir, dict } = await getLocaleAndDictionary();
  const result = await getPackageByTrackingNumber(decodeURIComponent(params.trackingNumber));
  const dateLocale = locale === 'en' ? 'en-US' : locale;

  return (
    <div dir={dir}>
      {/* Server component (fetches data), so all entrance motion here is pure
          CSS keyframes rather than framer-motion — no client-side JS needed.
          The gradient timeline "draws in" via a scaleY transform, echoing the
          brand's checkmark/verification motif — the one deliberate motion
          moment on this page; everything else is a restrained fade-up. */}
      <style>{`
        @keyframes trackFadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes trackLineGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
      `}</style>

      <TrackHeader locale={locale} tagline={dict.headerTagline} />
      <main className="min-h-screen bg-[#05070C] px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/track"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#8B98AC] hover:text-[#F4F7FB]"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {dict.result.backLink}
          </Link>

          {!result ? (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1220] text-[#8B98AC]">
                <PackageX className="h-6 w-6" />
              </span>
              <h1 className="font-display text-lg font-semibold text-[#F4F7FB]">{dict.result.notFoundTitle}</h1>
              <p className="mt-1.5 max-w-xs text-sm text-[#8B98AC]">{dict.result.notFoundBody}</p>
              <div className="mt-8 w-full max-w-sm">
                <TrackSearchBox
                  autoFocus={false}
                  placeholder={dict.landing.placeholder}
                  submitLabel={dict.landing.submit}
                />
              </div>
            </div>
          ) : (
            <>
              <div
                className="flex flex-col gap-1.5 opacity-0"
                style={{ animation: 'trackFadeInUp 0.4s ease-out 0s forwards' }}
              >
                <p className="font-mono text-xs uppercase tracking-wide text-[#8B98AC]">
                  {result.pkg.tracking_number}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-display text-xl font-semibold text-[#F4F7FB]">
                    {result.pkg.origin || '—'} → {result.pkg.destination || '—'}
                  </h1>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusColor(result.pkg.status)}`}
                  >
                    {statusLabel(result.pkg.status, dict)}
                  </span>
                </div>
                {result.pkg.description && <p className="text-sm text-[#8B98AC]">{result.pkg.description}</p>}
                {result.pkg.estimated_delivery && (
                  <p className="text-sm text-[#8B98AC]">
                    {dict.result.estimatedDelivery}:{' '}
                    {new Date(result.pkg.estimated_delivery).toLocaleDateString(dateLocale)}
                  </p>
                )}
              </div>

              <div
                className="mt-10 opacity-0"
                style={{ animation: 'trackFadeInUp 0.4s ease-out 0.1s forwards' }}
              >
                <h2 className="mb-4 font-display text-sm font-semibold text-[#F4F7FB]">
                  {dict.result.deliveryHistory}
                </h2>

                <div className="relative">
                  {/* Static faint track line, always visible */}
                  <div className="absolute inset-y-0 start-0 w-px bg-white/10" />
                  {/* Animated gradient line drawing over it */}
                  <div
                    className="absolute start-0 top-0 h-full w-px origin-top bg-gradient-to-b from-[#2563EB] to-[#22D3EE]"
                    style={{ animation: 'trackLineGrow 0.9s cubic-bezier(0.22,1,0.36,1) 0.3s both' }}
                  />

                  <ol className="flex flex-col gap-6 ps-6">
                    {[...result.events].reverse().map((event, i) => (
                      <li
                        key={event.id}
                        className="relative opacity-0"
                        style={{ animation: `trackFadeInUp 0.4s ease-out ${0.45 + i * 0.08}s forwards` }}
                      >
                        <span
                          className={`absolute -start-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-[#05070C] ${
                            i === 0 ? 'bg-gradient-to-br from-[#2563EB] to-[#22D3EE]' : 'bg-white/15'
                          }`}
                        >
                          {i === 0 && <MapPin className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <p className="text-sm font-medium text-[#F4F7FB]">{statusLabel(event.status, dict)}</p>
                        {event.location && <p className="text-xs text-[#8B98AC]">{event.location}</p>}
                        {event.note && <p className="mt-1 text-sm text-[#8B98AC]">{event.note}</p>}
                        <p className="mt-1 text-xs text-[#8B98AC]">
                          {new Date(event.created_at).toLocaleString(dateLocale)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}