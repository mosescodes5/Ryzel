import { createAdminClient } from '@/lib/supabase/server';

type RateLimitParams = {
  key: string; // e.g. `topup:${userId}` — caller picks the scope
  limit: number;
  windowSeconds: number;
};

/**
 * Fixed-window counter stored in Supabase (see migration 0004). Good
 * enough for "stop a runaway script from draining a wallet or hammering
 * a paid provider API" — not trying to be a general-purpose limiter.
 *
 * Fails open: if the rate-limit check itself errors (DB hiccup), the
 * request is allowed rather than blocked — a broken limiter shouldn't
 * take down the feature it's protecting.
 */
export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitParams): Promise<{
  allowed: boolean;
  count: number;
}> {
  const admin = createAdminClient();
  const bucketMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / bucketMs) * bucketMs).toISOString();

  const { data, error } = await admin.rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: windowStart
  });

  if (error) {
    console.error('Rate limit check failed, allowing request', error);
    return { allowed: true, count: 0 };
  }

  const count = Number(data);
  return { allowed: count <= limit, count };
}
