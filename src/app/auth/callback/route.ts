import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

/**
 * Every Supabase auth email (signup confirmation, password recovery,
 * magic link) points here via `emailRedirectTo`/`redirectTo`, with a
 * one-time `code` param and a `next` param telling us where to send the
 * person afterward. This is the PKCE flow's token exchange step — without
 * it, the code in the URL never becomes an actual logged-in session.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_link_invalid`);
}
