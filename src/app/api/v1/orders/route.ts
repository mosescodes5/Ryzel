import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listActivationOrdersForUser } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const orders = await listActivationOrdersForUser(user.id);
  return NextResponse.json({ data: orders });
}
