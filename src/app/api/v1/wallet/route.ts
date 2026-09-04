import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const [{ data: profile }, { data: transactions }] = await Promise.all([
    supabase.from('profiles').select('wallet_balance_cents').eq('id', user.id).single(),
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  return NextResponse.json({
    data: {
      balanceCents: profile?.wallet_balance_cents ?? 0,
      transactions: transactions ?? []
    }
  });
}
