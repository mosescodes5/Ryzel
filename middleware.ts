import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return response;
}

export async function middleware(request: NextRequest) {
  // track.ryzel.online is the same Next.js deployment as ryzel.online,
  // just pointed at a different path via this rewrite — so "/" on that
  // hostname serves the /track landing page instead of the main site, and
  // a tracking number typed straight into the URL (track.ryzel.online/RYZ-...)
  // also resolves. Kept entirely separate from the SMS/number marketplace
  // routes on purpose — this rewrite only ever points at /track/*.
  const hostname = request.headers.get('host') ?? '';
  if (hostname.startsWith('track.') && !request.nextUrl.pathname.startsWith('/track')) {
    const url = request.nextUrl.clone();
    url.pathname = `/track${request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  // CORS_ORIGINS lets other RYZEL subdomains (e.g. track.ryzel.online) call
  // this app's /api routes cross-origin. Only applies to /api — page routes
  // don't need it.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return applyCors(request, new NextResponse(null, { status: 204 }));
    }
    const response = await updateSession(request);
    return applyCors(request, response);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, so the auth cookie stays
     * fresh across the whole app (dashboard, admin, API routes included).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
