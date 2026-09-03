import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkActivationOrder } from '@/modules/numbers/services/activation-service';
import { checkRateLimit } from '@/lib/rate-limit/rate-limit';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  // A person impatiently clicking "Check for code" is normal; a script
  // doing it in a tight loop against 5sim's API is not.
  const rate = await checkRateLimit({ key: `check:${user.id}`, limit: 20, windowSeconds: 60 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Checking too fast — wait a moment and try again.' }, { status: 429 });
  }

  try {
    const order = await checkActivationOrder({ userId: user.id, orderId: params.id });
    return NextResponse.json({ data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not check order';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
