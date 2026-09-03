import { createAdminClient, createClient } from '@/lib/supabase/server';
import { debitWallet, creditWallet } from '@/lib/payments/wallet';
import { getActivationProvider } from '../providers/activation-provider-manager';
import { getPricingRule, getPricingRuleAsAdmin, applyMarkup } from '@/lib/pricing/number-pricing';
import { recordInboundSms } from '@/modules/sms/services/sms-service';
import { sendSms, buildCodeReceivedMessage } from '@/lib/notifications/sms/brevo';
import type { ActivationOrder } from '../providers/activation-provider';

type AdminClient = ReturnType<typeof createAdminClient>;

export type ProductQuote = {
  product: string;
  operator: string;
  priceCents: number; // what the customer pays (cost + markup)
  quantity: number;
};

export type OfferQuote = {
  operator: string;
  priceCents: number; // what the customer pays (cost + markup)
  successRate: number | null;
  quantity: number;
};

/** Every country 5sim currently sells numbers for — no pricing involved, just the picklist. */
export async function getCountryCatalog() {
  const provider = getActivationProvider();
  return provider.listCountries();
}

/** Customer-facing catalog for a country: provider cost with markup applied, no raw cost exposed. */
export async function getProductCatalog(country: string): Promise<ProductQuote[]> {
  const provider = getActivationProvider();
  const products = await provider.listProducts({ country });

  // Per-product markup (set in Admin > Pricing) takes priority; anything
  // without an override falls back to the one global markup rule.
  const priced = await Promise.all(
    products.map(async (p) => {
      const pricing = await getPricingRule(p.product);
      return {
        product: p.product,
        operator: p.operator,
        priceCents: applyMarkup(p.costCents, pricing),
        quantity: p.quantity
      };
    })
  );

  return priced.sort((a, b) => a.priceCents - b.priceCents);
}

/**
 * Every currently-stocked operator pool for one service+country, priced
 * for the customer — this is what "Check Availability" renders as
 * several selectable cards (price + success rate) rather than one flat
 * buy button, since different pools genuinely differ in price and
 * delivery reliability.
 */
export async function getOfferCatalog(country: string, product: string): Promise<OfferQuote[]> {
  const provider = getActivationProvider();
  const offers = await provider.listOffers({ country, product });
  const pricing = await getPricingRule(product);

  return offers
    .map((o) => ({
      operator: o.operator,
      priceCents: applyMarkup(o.costCents, pricing),
      successRate: o.successRate,
      quantity: o.quantity
    }))
    .sort((a, b) => a.priceCents - b.priceCents);
}

/**
 * Buys a number for one service (e.g. "telegram") and charges the
 * customer's wallet. The wallet is debited at the *quoted* price before
 * calling the provider; if the provider purchase fails, the debit is
 * reversed. The provider's actual charged cost (which can differ
 * slightly from the quote) is stored as cost_cents so profit reporting
 * reflects reality, not the estimate.
 */
export async function purchaseActivationNumber({
  userId,
  country,
  operator,
  product
}: {
  userId: string;
  country: string;
  operator: string;
  product: string;
}) {
  const provider = getActivationProvider();

  // Re-quote right before charging rather than trusting a client-supplied
  // price — matched against the specific operator pool the customer picked
  // (offers at different operators can have very different prices for the
  // same product), not just "some price for this product".
  const offers = await provider.listOffers({ country, product });
  const match = offers.find((o) => o.operator === operator) ?? offers[0];
  if (!match || match.quantity < 1) {
    throw new Error('That number is no longer available for this country/service.');
  }

  const pricing = await getPricingRuleAsAdmin(product);
  const quotedPriceCents = applyMarkup(match.costCents, pricing);

  await debitWallet({
    userId,
    amountCents: quotedPriceCents,
    reason: 'number_purchase'
  });

  const admin = createAdminClient();

  try {
    const order = await provider.buyActivation({ country, operator: match.operator, product });

    const expiresAt =
      order.expiresAt ??
      new Date(Date.now() + Number(process.env.ORDER_TIMEOUT_SECONDS ?? '600') * 1000).toISOString();

    const { data: row, error } = await admin
      .from('number_orders')
      .insert({
        user_id: userId,
        provider: provider.name,
        provider_order_id: order.providerOrderId,
        phone_number: order.phoneNumber,
        country,
        operator: order.operator,
        product: order.product,
        status: order.status,
        price_cents: quotedPriceCents,
        cost_cents: order.costCents,
        expires_at: expiresAt,
        last_checked_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Wallet debit above already used quotedPriceCents as both charge and
    // (via cost_cents on the row) the profit baseline — no second debit needed.
    return row;
  } catch (err) {
    await creditWallet({
      userId,
      amountCents: quotedPriceCents,
      reason: 'number_purchase_refund'
    });
    throw err;
  }
}

/**
 * Shared by the single-order check (customer clicks "Check for code") and
 * the bulk poller (cron hitting every pending order). Applies a provider
 * result to the DB row: updates status, records a newly-arrived code, and
 * fires the Brevo alert — exactly once per code, regardless of which path
 * triggered the check.
 */
async function applyCheckResult(
  admin: AdminClient,
  order: { id: string; user_id: string; status: string; product: string | null; phone_number: string | null },
  result: ActivationOrder
) {
  const wasAlreadyReceived = order.status === 'received' || order.status === 'finished';

  await admin
    .from('number_orders')
    .update({ status: result.status, last_checked_at: new Date().toISOString() })
    .eq('id', order.id);

  if (result.status === 'received' && !wasAlreadyReceived && result.smsCode) {
    await recordInboundSms({
      numberOrderId: order.id,
      fromNumber: order.product ?? 'unknown',
      body: result.smsText ?? result.smsCode,
      receivedAt: new Date().toISOString()
    });

    const { data: profile } = await admin
      .from('profiles')
      .select('notify_phone_number')
      .eq('id', order.user_id)
      .single();

    if (profile?.notify_phone_number) {
      await sendSms({
        to: profile.notify_phone_number,
        content: buildCodeReceivedMessage({
          phoneNumber: order.phone_number ?? '',
          product: order.product ?? 'service',
          code: result.smsCode,
          text: result.smsText
        })
      });
    }
  }
}

/**
 * Polls the provider for a code. If a code has newly arrived, records it
 * in sms_messages, updates the order, and fires a Brevo SMS to the
 * customer's notify_phone_number if they've set one.
 */
export async function checkActivationOrder({ userId, orderId }: { userId: string; orderId: string }) {
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from('number_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) throw new Error('Order not found');
  if (!order.provider_order_id) throw new Error('This order has no provider reference to check');

  const provider = getActivationProvider();
  const result = await provider.checkOrder(order.provider_order_id);

  await applyCheckResult(admin, order, result);

  return { ...order, status: result.status, smsCode: result.smsCode, smsText: result.smsText };
}

/**
 * Bulk version for the cron poller: checks every order still awaiting a
 * code (skipping ones already past their provider expiry — those are
 * marked expired without spending a provider call), across every user.
 *
 * Kept deliberately simple: sequential, capped batch size. A busier
 * platform would want a queue and concurrency limits instead of a single
 * cron invocation walking the whole table.
 */
export async function pollAllPendingOrders({ batchSize = 50 }: { batchSize?: number } = {}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Expire anything past its window without wasting a provider call on it.
  const { data: expired } = await admin
    .from('number_orders')
    .update({ status: 'expired' })
    .eq('status', 'awaiting_sms')
    .lt('expires_at', now)
    .select('id');

  const { data: pending, error } = await admin
    .from('number_orders')
    .select('*')
    .eq('status', 'awaiting_sms')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw error;

  const provider = getActivationProvider();
  let checked = 0;
  let codesFound = 0;
  const errors: string[] = [];

  for (const order of pending ?? []) {
    if (!order.provider_order_id) continue;
    try {
      const result = await provider.checkOrder(order.provider_order_id);
      await applyCheckResult(admin, order, result);
      checked += 1;
      if (result.status === 'received') codesFound += 1;
    } catch (err) {
      errors.push(`${order.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return {
    expiredCount: expired?.length ?? 0,
    checked,
    codesFound,
    errors
  };
}

/** Cancels an order and refunds the customer if no code was ever received. */
export async function cancelActivationOrder({ userId, orderId }: { userId: string; orderId: string }) {
  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from('number_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) throw new Error('Order not found');
  if (order.status === 'received' || order.status === 'finished') {
    throw new Error('Cannot cancel — a code was already delivered for this number.');
  }

  const provider = getActivationProvider();
  if (order.provider_order_id) {
    await provider.cancelOrder(order.provider_order_id);
  }

  await admin.from('number_orders').update({ status: 'cancelled' }).eq('id', order.id);

  await creditWallet({
    userId,
    amountCents: order.price_cents,
    reason: 'number_cancel_refund',
    referenceType: 'number_orders',
    referenceId: order.id
  });

  return { refundedCents: order.price_cents };
}

export async function listActivationOrdersForUser(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('number_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
