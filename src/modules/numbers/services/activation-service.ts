import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getActivationProvider } from '../providers/activation-provider-manager';
import { getPricingRule, getPricingRuleAsAdmin, applyMarkup } from '@/lib/pricing/number-pricing';
import { recordInboundSms } from '@/modules/sms/services/sms-service';
import { sendSms, buildCodeReceivedMessage } from '@/lib/notifications/sms/brevo';
import type { ActivationOrder } from '../providers/activation-provider';
import { reserveOrder, refundOrder } from './order-ledger';
import { ProviderError, isDefiniteNonPurchase, customerMessageForRejection } from '../lib/provider-errors';
import { reconcileBatch, type PurchasingOrder } from '../lib/reconcile';

type AdminClient = ReturnType<typeof createAdminClient>;

export type ProductQuote = {
  product: string;
  operator: string;
  priceNaira: number; // what the customer pays, whole naira (cost + markup)
  quantity: number;
};

export type OfferQuote = {
  operator: string;
  priceNaira: number; // what the customer pays, whole naira (cost + markup)
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
        priceNaira: applyMarkup(p.costNaira, pricing),
        quantity: p.quantity
      };
    })
  );

  return priced.sort((a, b) => a.priceNaira - b.priceNaira);
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
      priceNaira: applyMarkup(o.costNaira, pricing),
      successRate: o.successRate,
      quantity: o.quantity
    }))
    .sort((a, b) => a.priceNaira - b.priceNaira);
}

/** The purchase is saved and charged, but we have not yet confirmed the number. Money is held, not lost. */
export class PurchasePendingError extends Error {
  readonly orderId: string;
  constructor(orderId: string) {
    super(
      'Your purchase is being confirmed with our provider. Check My Orders in a minute: you will get your number, or an automatic refund.'
    );
    this.name = 'PurchasePendingError';
    this.orderId = orderId;
  }
}

const RECONCILE_MIN_AGE_MS = 45_000; // give the original request time to finish on its own
const HISTORY_LIMIT = 100;
const EXPIRY_GRACE_MS = 30_000;

/**
 * Buys a number for one service and charges the customer's wallet (whole naira).
 *
 * Order of operations, chosen so money can never be lost or created:
 *   1. Re-quote from the provider (never trust a client-supplied price).
 *   2. order_reserve(): ONE database transaction debits the wallet and creates
 *      the order as 'purchasing'. There is never a charge without an order row.
 *   3. Call the provider ONCE (no automatic retry) with a timeout.
 *   4a. Success            -> record the number, status 'awaiting_sms'.
 *   4b. Clear refusal (4xx)-> nothing was bought: refund exactly once.
 *   4c. Anything uncertain (timeout, dropped connection, 5xx, unreadable reply,
 *       or a database hiccup while saving) -> leave the order 'purchasing'.
 *       The poller later checks the provider's own history and either adopts
 *       the number or refunds on positive proof it was never bought.
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

  const offers = await provider.listOffers({ country, product });
  const match = offers.find((o) => o.operator === operator) ?? offers[0];
  if (!match || match.quantity < 1) {
    throw new Error('That number is no longer available for this country/service.');
  }

  const pricing = await getPricingRuleAsAdmin(product);
  const priceNaira = applyMarkup(match.costNaira, pricing);

  const { orderId } = await reserveOrder({
    userId,
    priceNaira,
    provider: provider.name,
    country,
    operator: match.operator,
    product
  });

  const admin = createAdminClient();

  let bought: ActivationOrder;
  try {
    bought = await provider.buyActivation({ country, operator: match.operator, product });
  } catch (err) {
    if (err instanceof ProviderError && isDefiniteNonPurchase(err.failure)) {
      await refundOrder(orderId, 'failed', 'number_purchase_refund');
      throw new Error(customerMessageForRejection(err.failure));
    }
    // Uncertain: a number may exist upstream. Keep the money held; the poller settles it.
    console.error('purchase uncertain', orderId, err instanceof Error ? err.message : err);
    throw new PurchasePendingError(orderId);
  }

  const expiresAt =
    bought.expiresAt ??
    new Date(Date.now() + Number(process.env.ORDER_TIMEOUT_SECONDS ?? '600') * 1000).toISOString();

  const { data: row, error } = await admin
    .from('number_orders')
    .update({
      provider_order_id: bought.providerOrderId,
      phone_number: bought.phoneNumber,
      operator: bought.operator,
      product: bought.product,
      // Once we hold the provider's order id the order is no longer "unconfirmed".
      // The poller's next check records the true state (code / cancelled / expired).
      status: 'awaiting_sms',
      cost_cents: bought.costNaira,
      expires_at: expiresAt,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'purchasing')
    .select()
    .single();

  if (error || !row) {
    // The provider DID sell us a number but we couldn't save it. Never refund here:
    // the poller will find it in the provider's history and adopt it.
    console.error('purchase saved-failed', orderId, bought.providerOrderId, error?.message);
    throw new PurchasePendingError(orderId);
  }

  return row;
}

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  product: string | null;
  phone_number: string | null;
  price_cents: number;
  provider_order_id?: string | null;
};

/**
 * Applies one provider result to an order, exactly once per outcome, no matter
 * whether the customer's "Check" button or the poller got here first.
 *
 *  - code arrived         -> status moves with a conditional update; only the
 *                            caller that wins the move records the SMS/alert
 *  - cancelled/expired/
 *    banned, no code      -> refund via order_refund (exactly once)
 *  - still waiting        -> just stamp last_checked_at
 */
async function applyCheckResult(admin: AdminClient, order: OrderRow, result: ActivationOrder) {
  const now = new Date().toISOString();

  if (result.status === 'received' || result.status === 'finished') {
    const { data: moved } = await admin
      .from('number_orders')
      .update({ status: result.status, last_checked_at: now, updated_at: now })
      .eq('id', order.id)
      .in('status', ['awaiting_sms', 'purchasing', 'needs_review'])
      .select('id');

    const wonTheMove = (moved?.length ?? 0) > 0;
    if (wonTheMove && result.smsCode) {
      await recordInboundSms({
        numberOrderId: order.id,
        fromNumber: order.product ?? 'unknown',
        body: result.smsText ?? result.smsCode,
        receivedAt: now
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
    } else if (wonTheMove && !result.smsCode) {
      console.error('order marked received without a code', order.id);
    }
    return;
  }

  if (result.status === 'cancelled' || result.status === 'expired' || result.status === 'failed') {
    // Provider says the order is over and no code was delivered: give the money back, once.
    await refundOrder(order.id, result.status, `number_${result.status}_refund`);
    return;
  }

  await admin
    .from('number_orders')
    .update({ last_checked_at: now })
    .eq('id', order.id)
    .eq('status', 'awaiting_sms');
}

/**
 * Customer clicks "Check for code". Same logic as the poller.
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
  if (order.status === 'purchasing') {
    return { ...order, smsCode: null, smsText: null };
  }
  if (!order.provider_order_id) throw new Error('This order has no provider reference to check');

  const provider = getActivationProvider();
  const result = await provider.checkOrder(order.provider_order_id);

  await applyCheckResult(admin, order, result);

  return { ...order, status: result.status, smsCode: result.smsCode, smsText: result.smsText };
}

/**
 * Settles orders stuck in 'purchasing' by comparing them with the provider's
 * own purchase history. See ../lib/reconcile.ts for the exact rules. Refunds
 * only on positive proof of absence; anything ambiguous is held for review.
 */
async function reconcilePurchasing(admin: AdminClient) {
  const cutoff = new Date(Date.now() - RECONCILE_MIN_AGE_MS).toISOString();
  const { data: stuck, error } = await admin
    .from('number_orders')
    .select('id, country, product, operator, purchase_started_at, provider')
    .eq('status', 'purchasing')
    .is('provider_order_id', null) // an order we already hold a provider id for is never "unconfirmed"
    .lt('purchase_started_at', cutoff)
    .order('purchase_started_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  if (!stuck || stuck.length === 0) return { adopted: 0, refunded: 0, review: 0 };

  const provider = getActivationProvider();
  const orders: PurchasingOrder[] = stuck
    .filter((o) => o.provider === provider.name && o.country && o.product && o.purchase_started_at)
    .map((o) => ({
      id: o.id,
      country: o.country as string,
      product: o.product as string,
      operator: o.operator ?? 'any',
      startedAtMs: Date.parse(o.purchase_started_at as string)
    }));
  if (orders.length === 0) return { adopted: 0, refunded: 0, review: 0 };

  let upstream: Awaited<ReturnType<typeof provider.listRecentActivations>> = [];
  let historyFetchedOk = true;
  try {
    upstream = await provider.listRecentActivations(HISTORY_LIMIT);
  } catch (err) {
    console.error('reconcile: could not read provider history', err instanceof Error ? err.message : err);
    historyFetchedOk = false;
  }

  const ids = upstream.map((u) => u.providerOrderId);
  const claimed = new Set<string>();
  if (ids.length > 0) {
    const { data: taken } = await admin
      .from('number_orders')
      .select('provider_order_id')
      .eq('provider', provider.name)
      .in('provider_order_id', ids);
    for (const t of taken ?? []) if (t.provider_order_id) claimed.add(t.provider_order_id);
  }

  const earliest = Math.min(...orders.map((o) => o.startedAtMs));
  const oldestListed = upstream.length > 0 ? Math.min(...upstream.map((u) => u.createdAtMs)) : Infinity;
  const historyCoversWindow = upstream.length < HISTORY_LIMIT || oldestListed <= earliest - 60_000;

  const decisions = reconcileBatch({
    orders,
    upstream,
    claimedProviderIds: claimed,
    historyFetchedOk,
    historyCoversWindow,
    nowMs: Date.now()
  });

  let adopted = 0;
  let refunded = 0;
  let review = 0;
  const now = new Date().toISOString();

  for (const [orderId, decision] of decisions) {
    try {
      if (decision.action === 'adopt') {
        // Re-read the real order so we store its true phone/expiry/status.
        const real = await provider.checkOrder(decision.upstream.providerOrderId);
        const { error: upErr } = await admin
          .from('number_orders')
          .update({
            provider_order_id: real.providerOrderId,
            phone_number: real.phoneNumber,
            operator: real.operator,
            cost_cents: real.costNaira,
            status: 'awaiting_sms',
            expires_at: real.expiresAt,
            last_checked_at: now,
            review_note: 'Adopted by reconciliation after an unconfirmed purchase.',
            updated_at: now
          })
          .eq('id', orderId)
          .eq('status', 'purchasing');
        if (upErr) throw upErr;
        adopted += 1;
      } else if (decision.action === 'refund') {
        const r = await refundOrder(orderId, 'failed', 'number_purchase_refund');
        if (r.outcome === 'refunded') refunded += 1;
      } else if (decision.action === 'review') {
        await admin
          .from('number_orders')
          .update({ status: 'needs_review', review_note: decision.note, updated_at: now })
          .eq('id', orderId)
          .eq('status', 'purchasing');
        review += 1;
      }
    } catch (err) {
      console.error('reconcile step failed', orderId, err instanceof Error ? err.message : err);
    }
  }

  return { adopted, refunded, review };
}

/**
 * Background job (Cloudflare Cron, every minute):
 *   1. settle unconfirmed purchases
 *   2. check every order waiting for a code
 *   3. for orders past their window: confirm with the provider, then refund once
 *
 * A refund only ever follows the PROVIDER confirming the order is over (or the
 * customer cancelling). A merely stale local clock never refunds anyone.
 */
export async function pollAllPendingOrders({ batchSize = 15 }: { batchSize?: number } = {}) {
  const admin = createAdminClient();
  const provider = getActivationProvider();

  const reconciled = await reconcilePurchasing(admin);

  const { data: pending, error } = await admin
    .from('number_orders')
    .select('*')
    .eq('status', 'awaiting_sms')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw error;

  let checked = 0;
  let codesFound = 0;
  let refunded = 0;
  const errors: string[] = [];

  for (const order of pending ?? []) {
    if (!order.provider_order_id) {
      await admin
        .from('number_orders')
        .update({ status: 'needs_review', review_note: 'Awaiting code but has no provider order id.' })
        .eq('id', order.id)
        .eq('status', 'awaiting_sms');
      continue;
    }

    try {
      let result = await provider.checkOrder(order.provider_order_id);

      const pastWindow =
        order.expires_at !== null && Date.parse(order.expires_at) + EXPIRY_GRACE_MS < Date.now();

      if (result.status === 'awaiting_sms' && pastWindow) {
        // Window closed with no code: ask the provider to close it, then trust ITS answer.
        try {
          await provider.cancelOrder(order.provider_order_id);
        } catch (err) {
          errors.push(`${order.id}: cancel after expiry failed (${err instanceof Error ? err.message : 'unknown'})`);
        }
        result = await provider.checkOrder(order.provider_order_id);
      }

      await applyCheckResult(admin, order, result);
      checked += 1;
      if (result.status === 'received') codesFound += 1;
      if (result.status === 'cancelled' || result.status === 'expired' || result.status === 'failed') refunded += 1;
    } catch (err) {
      errors.push(`${order.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return { reconciled, checked, codesFound, refundedOrExpired: refunded, errors };
}

/** Cancels an order and refunds the customer (exactly once) if no code was ever received. */
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
  if (order.status === 'purchasing' || order.status === 'needs_review') {
    throw new Error('This order is still being confirmed. Please wait a minute; if it fails you are refunded automatically.');
  }
  if (order.refunded_at) {
    return { refundedNaira: 0 }; // already refunded — never twice
  }

  const provider = getActivationProvider();
  if (order.provider_order_id) {
    await provider.cancelOrder(order.provider_order_id);
  }

  const r = await refundOrder(order.id, 'cancelled', 'number_cancel_refund');
  return { refundedNaira: r.outcome === 'refunded' ? r.refundedNaira : 0 };
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
