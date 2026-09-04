import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/payments/providers/provider-manager';
import { creditWallet } from '@/lib/payments/wallet';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

/**
 * Called from the wallet page right after Korapay redirects the customer
 * back, so the balance updates immediately instead of waiting on the
 * webhook. Safe to call repeatedly — the payment row's status makes this
 * idempotent, same as the webhook handler.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');
  if (!reference) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('provider_reference', reference)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (payment.status === 'succeeded') {
    return NextResponse.json({ data: { status: 'succeeded' } });
  }

  const provider = getPaymentProvider();
  const verified = await provider.verifyCharge(reference);

  if (verified.status === 'success') {
    await creditWallet({
      userId: payment.user_id,
      amountCents: payment.amount_cents,
      reason: 'wallet_topup',
      referenceType: 'payments',
      referenceId: payment.id
    });
    await admin.from('payments').update({ status: 'succeeded' }).eq('id', payment.id);
    return NextResponse.json({ data: { status: 'succeeded' } });
  }

  if (verified.status === 'failed') {
    await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id);
  }

  return NextResponse.json({ data: { status: verified.status } });
}
