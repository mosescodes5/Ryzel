import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelActivationOrder } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const result = await cancelActivationOrder({ userId: user.id, orderId: params.id });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not cancel order';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
