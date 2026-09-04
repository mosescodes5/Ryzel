import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/payments/providers/provider-manager';
import { checkRateLimit } from '@/lib/rate-limit/rate-limit';
import { topupSchema, parseOrError } from '@/lib/validation/schemas';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

// Plain naira now (see korapay-provider.ts) — CONFIRM this is the minimum
// you actually want; previously equivalent to ₦1 (100 kobo), now set to
// match the wallet page UI's placeholder minimum. Change freely.
const MIN_TOPUP_CENTS = 50;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const rate = await checkRateLimit({ key: `topup:${user.id}`, limit: 5, windowSeconds: 600 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many top-up attempts — try again in a few minutes.' }, { status: 429 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = parseOrError(topupSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { amountCents } = parsed.data;

  if (amountCents < MIN_TOPUP_CENTS) {
    return NextResponse.json({ error: `Minimum top-up is ${MIN_TOPUP_CENTS}` }, { status: 400 });
  }

  const currency = process.env.KORAPAY_DEFAULT_CURRENCY ?? 'NGN';
  const reference = `wallet_topup_${crypto.randomUUID()}`;

  const admin = createAdminClient();

  const { error: insertError } = await admin.from('payments').insert({
    user_id: user.id,
    provider: 'korapay',
    provider_reference: reference,
    amount_cents: amountCents,
    currency,
    status: 'pending'
  });

  if (insertError) {
    return NextResponse.json({ error: 'Could not start payment' }, { status: 500 });
  }

  try {
    const provider = getPaymentProvider();
    const { checkoutUrl } = await provider.initializeCharge({
      reference,
      amountCents,
      currency,
      customerEmail: user.email!,
      redirectUrl: `${process.env.KORAPAY_REDIRECT_URL || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/wallet`}?reference=${reference}`
    });

    return NextResponse.json({ data: { checkoutUrl, reference } });
  } catch (err) {
    await admin.from('payments').update({ status: 'failed' }).eq('provider_reference', reference);
    const message = err instanceof Error ? err.message : 'Could not start payment';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}