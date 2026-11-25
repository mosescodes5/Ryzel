import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/payments/providers/provider-manager';
import { settlePayment } from '@/lib/payments/wallet';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

/**
 * Korapay calls this directly — not authenticated with a user session.
 * Trust nothing from the payload beyond "which reference to look up":
 * signature is checked, then the charge is re-verified server-to-server
 * with Korapay, and the credited amount comes from our own `payments`
 * row (set when we initiated the charge), never from the webhook body.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-korapay-signature');

  const provider = getPaymentProvider();
  if (!(await provider.verifyWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const reference: string | undefined = payload?.data?.reference;
  const event: string | undefined = payload?.event;

  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('provider_reference', reference)
    .maybeSingle();

  if (!payment) {
    // Not one of ours (or already deleted) — acknowledge so Korapay stops retrying.
    return NextResponse.json({ ok: true });
  }

  if (payment.status === 'succeeded') {
    // Already processed — webhooks can be delivered more than once.
    return NextResponse.json({ ok: true });
  }

  if (event !== 'charge.success') {
    if (event === 'charge.failed') {
      await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    }
    return NextResponse.json({ ok: true });
  }

  // Re-verify server-to-server before crediting anything.
  const verified = await provider.verifyCharge(reference);
  if (verified.status !== 'success') {
    return NextResponse.json({ ok: true });
  }

  // Atomic + idempotent: safe even if /wallet/verify settles the same payment concurrently.
  // The amount/currency Korapay reports must match what we initiated or nothing is credited.
  const settled = await settlePayment({
    reference,
    verifiedAmount: verified.amountCents,
    verifiedCurrency: verified.currency
  });

  if (settled.outcome === 'amount_mismatch') {
    console.error('Korapay amount/currency mismatch — payment NOT credited', { reference });
    // 200 so Korapay stops retrying; the mismatch is recorded in audit_logs for review.
  }

  return NextResponse.json({ ok: true });
}
