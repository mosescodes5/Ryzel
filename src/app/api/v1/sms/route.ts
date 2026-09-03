import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { recordInboundSms } from '@/modules/sms/services/sms-service';
import { inboundSmsWebhookSchema, parseOrError } from '@/lib/validation/schemas';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

/**
 * Inbound webhook for a *future* carrier that pushes SMS directly (Twilio,
 * etc.) — NOT used by the current 5sim flow, since 5sim has no webhook and
 * is polled instead (see modules/numbers/services/activation-service.ts).
 * Kept as the extension point for when a direct-push carrier is added.
 * Verify the provider's request signature here once one is wired up.
 */
export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = parseOrError(inboundSmsWebhookSchema, rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { toNumber, fromNumber, body } = parsed.data;

  const admin = createAdminClient();

  const { data: inventoryRow } = await admin
    .from('number_inventory')
    .select('id')
    .eq('phone_number', toNumber)
    .maybeSingle();

  if (!inventoryRow) {
    return NextResponse.json({ error: 'Unknown destination number' }, { status: 404 });
  }

  const { data: order } = await admin
    .from('number_orders')
    .select('id')
    .eq('number_id', inventoryRow.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'No active order for this number' }, { status: 404 });
  }

  await recordInboundSms({
    numberOrderId: order.id,
    fromNumber,
    body: body ?? '',
    receivedAt: new Date().toISOString()
  });

  return NextResponse.json({ ok: true });
}

/** Authenticated: list inbound SMS for one of the current user's orders. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  // RLS on sms_messages already scopes this to the requesting user's orders.
  const { data, error } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('number_order_id', orderId)
    .order('received_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
