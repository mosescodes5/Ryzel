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

const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'pt', 'ar'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  FR: 'fr', BE: 'fr', CA: 'fr', CH: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
  SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar',
  IQ: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LB: 'ar', LY: 'ar', YE: 'ar', SY: 'ar'
};

function detectLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale;
  }
  const cfCountry =
    (request as unknown as { cf?: { country?: string } }).cf?.country ??
    request.headers.get('cf-ipcountry') ??
    undefined;
  if (cfCountry && COUNTRY_TO_LOCALE[cfCountry]) {
    return COUNTRY_TO_LOCALE[cfCountry];
  }
  return 'en';
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const pathname = request.nextUrl.pathname;

  // --- TEMPORARY DEBUG: remove once the routing issue is confirmed fixed ---
  const debugHeaders = {
    'x-debug-host': hostname,
    'x-debug-pathname': pathname,
    'x-debug-nexturl-hostname': request.nextUrl.hostname
  };
  // ---------------------------------------------------------------------

  const isTrackRoute = hostname.startsWith('track.') || pathname.startsWith('/track');
  let localeCookieToSet: Locale | null = null;
  if (isTrackRoute) {
    const hadCookie = request.cookies.get('NEXT_LOCALE')?.value;
    if (!hadCookie) {
      localeCookieToSet = detectLocale(request);
    }
  }

  if (!hostname.startsWith('track.') && pathname.startsWith('/track')) {
    const url = request.nextUrl.clone();
    url.hostname = `track.${request.nextUrl.hostname}`;
    url.pathname = pathname === '/track' ? '/' : pathname.replace(/^\/track/, '');
    const response = NextResponse.redirect(url, 308);
    Object.entries(debugHeaders).forEach(([k, v]) => response.headers.set(k, v));
    if (localeCookieToSet) {
      response.cookies.set('NEXT_LOCALE', localeCookieToSet, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    return response;
  }

  if (hostname.startsWith('track.') && !pathname.startsWith('/track')) {
    const url = request.nextUrl.clone();
    url.pathname = `/track${pathname === '/' ? '' : pathname}`;
    const response = NextResponse.rewrite(url);
    Object.entries(debugHeaders).forEach(([k, v]) => response.headers.set(k, v));
    if (localeCookieToSet) {
      response.cookies.set('NEXT_LOCALE', localeCookieToSet, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    return response;
  }

  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      Object.entries(debugHeaders).forEach(([k, v]) => response.headers.set(k, v));
      return applyCors(request, response);
    }
    const response = await updateSession(request);
    Object.entries(debugHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return applyCors(request, response);
  }

  const response = await updateSession(request);
  Object.entries(debugHeaders).forEach(([k, v]) => response.headers.set(k, v));
  if (localeCookieToSet) {
    response.cookies.set('NEXT_LOCALE', localeCookieToSet, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};