import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { purchaseActivationNumber } from '@/modules/numbers/services/activation-service';
import { checkRateLimit } from '@/lib/rate-limit/rate-limit';
import { purchaseNumberSchema, parseOrError } from '@/lib/validation/schemas';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  // Caps how fast a compromised session or buggy script can drain a wallet
  // and hammer 5sim — generous enough for a real person shopping normally.
  const rate = await checkRateLimit({ key: `purchase:${user.id}`, limit: 10, windowSeconds: 300 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many purchases — slow down and try again shortly.' }, { status: 429 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = parseOrError(purchaseNumberSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const order = await purchaseActivationNumber({ userId: user.id, ...parsed.data });
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Purchase failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
