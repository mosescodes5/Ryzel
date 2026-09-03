import { NextResponse } from 'next/server';
import { getPackageByTrackingNumber } from '@/lib/packages/package-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

// This is a genuinely public, unauthenticated lookup (same trust model as
// this app's own /track/[trackingNumber] page — the tracking number itself
// is what limits access, not a login), so browsers calling it cross-origin
// from another RYZEL subdomain (e.g. track.ryzel.online, the standalone
// ryzel-track frontend) need CORS headers here. CORS_ORIGINS is the same
// env var already documented in .env.example for this exact purpose.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(requestOrigin: string | null): HeadersInit {
  const allowOrigin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : (ALLOWED_ORIGINS[0] ?? '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // The allowed origin varies per-request (echoed back from an allow
    // list rather than a single static value), so caches must key on it.
    Vary: 'Origin'
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const headers = corsHeaders(request.headers.get('origin'));

  const result = await getPackageByTrackingNumber(decodeURIComponent(params.code));
  if (!result) {
    return NextResponse.json({ error: 'Tracking code not found' }, { status: 404, headers });
  }

  const { pkg, events } = result;

  // Shaped to match the `PublicShipment` interface ryzel-track's
  // TrackingTimeline component already expects, so that frontend needs no
  // further changes beyond pointing its fetch at this endpoint. This app's
  // packages don't track a carrier brand or a display language, so those
  // fields get sane fixed defaults rather than being omitted.
  return NextResponse.json(
    {
      tracking_code: pkg.tracking_number,
      carrier_style: 'generic',
      carrier_name: null,
      origin: pkg.origin,
      destination: pkg.destination,
      package_description: pkg.description,
      language: 'en',
      status: pkg.status,
      estimated_delivery: pkg.estimated_delivery,
      updated_at: pkg.updated_at,
      events: events.map((event) => ({
        status: event.status,
        location: event.location,
        note: event.note,
        timestamp: event.created_at
      }))
    },
    { headers }
  );
}
