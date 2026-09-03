import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

// Server-only code can read either naming convention. The browser client
// (client.ts) can't do this fallback — Next.js only inlines the literal
// `NEXT_PUBLIC_...` token at build time, so those two vars must exist
// under that exact name for the app to work in the browser at all.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

/**
 * Server-side Supabase client (RLS-scoped to the requesting user).
 * Use in server components, route handlers, and server actions.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component with no writable cookie jar — safe to ignore
          // when middleware is refreshing the session.
        }
      },
      remove(name: string, options) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // See note above.
        }
      }
    }
  });
}

/**
 * Service-role client for trusted server-only operations (admin writes,
 * provider callbacks). NEVER import this into client-facing code paths.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });
}
