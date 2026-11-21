import { createAdminClient } from '@/lib/supabase/server';
import { InsufficientFundsError } from '@/lib/payments/wallet';

/**
 * Thin wrappers over the two Postgres functions in migration 0012. All money
 * here is whole naira. Server-only (service role).
 *
 * order_reserve: debits the wallet AND creates the order in one transaction.
 * order_refund : refunds an order exactly once, however often it is called.
 */

export type RefundOutcome = 'refunded' | 'already_refunded' | 'not_refundable' | 'not_found';
export type RefundFinalStatus = 'cancelled' | 'expired' | 'failed';

export async function reserveOrder(args: {
  userId: string;
  priceNaira: number;
  provider: string;
  country: string;
  operator: string;
  product: string;
}): Promise<{ orderId: string; newBalanceNaira: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('order_reserve', {
    p_user: args.userId,
    p_price: args.priceNaira,
    p_provider: args.provider,
    p_country: args.country,
    p_operator: args.operator,
    p_product: args.product
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_FUNDS')) throw new InsufficientFundsError();
    throw new Error(`Could not reserve order: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Could not reserve order: empty result');
  return { orderId: String(row.order_id), newBalanceNaira: Number(row.new_balance) };
}

export async function refundOrder(
  orderId: string,
  finalStatus: RefundFinalStatus,
  reason: string
): Promise<{ outcome: RefundOutcome; refundedNaira: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('order_refund', {
    p_order: orderId,
    p_final_status: finalStatus,
    p_reason: reason
  });
  if (error) throw new Error(`Refund failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Refund returned no result');
  return { outcome: row.outcome as RefundOutcome, refundedNaira: Number(row.refunded) };
}
