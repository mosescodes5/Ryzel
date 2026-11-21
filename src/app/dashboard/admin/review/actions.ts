'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { refundOrder } from '@/modules/numbers/services/order-ledger';

/**
 * Admin resolution for orders the system could not settle on its own.
 * Both actions only act on orders that are still unsettled, and every
 * action leaves an audit_logs row naming the admin.
 */

async function audit(actorId: string, action: string, orderId: string, metadata: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('audit_logs')
    .insert({ actor_id: actorId, action, target_type: 'number_orders', target_id: orderId, metadata });
  if (error) console.error('audit log failed', action, orderId, error.message);
}

/**
 * Refunds the customer in full, exactly once (order_refund refuses a second
 * refund, and refuses any order that already delivered a code).
 * Do this only after checking 5sim's own order history for that service/time:
 * if 5sim DID sell the number, refunding means you absorb its cost.
 */
export async function refundReviewOrder(orderId: string) {
  const adminUser = await requireAdmin();

  const admin = createAdminClient();
  const { data: order } = await admin.from('number_orders').select('status').eq('id', orderId).single();
  if (!order || (order.status !== 'needs_review' && order.status !== 'purchasing')) {
    throw new Error('Only unsettled orders can be refunded from here.');
  }

  const result = await refundOrder(orderId, 'failed', 'number_purchase_refund_admin');
  await audit(adminUser.id, 'order.review_refund', orderId, { outcome: result.outcome, refunded: result.refundedNaira });

  revalidatePath('/dashboard/admin/review');
  revalidatePath('/dashboard/admin');
}

/**
 * Puts the order back into the automatic process. With a provider id it goes
 * back to "waiting for code" (the poller re-checks it); without one it goes
 * back to "confirming purchase" (the poller re-reads the provider history).
 */
export async function retryReviewOrder(orderId: string) {
  const adminUser = await requireAdmin();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('number_orders')
    .select('status, provider_order_id')
    .eq('id', orderId)
    .single();
  if (!order || order.status !== 'needs_review') {
    throw new Error('Only orders under review can be retried.');
  }

  const now = new Date().toISOString();
  const nextStatus = order.provider_order_id ? 'awaiting_sms' : 'purchasing';
  const { error } = await admin
    .from('number_orders')
    .update({
      status: nextStatus,
      review_note: null,
      purchase_started_at: order.provider_order_id ? undefined : now,
      updated_at: now
    })
    .eq('id', orderId)
    .eq('status', 'needs_review');
  if (error) throw error;

  await audit(adminUser.id, 'order.review_retry', orderId, { nextStatus });

  revalidatePath('/dashboard/admin/review');
}
