import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { purchaseNumber } from '@/modules/numbers/services/number-service';

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
    const order = await purchaseNumber({ userId: user.id, numberInventoryId: params.id });
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Purchase failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
