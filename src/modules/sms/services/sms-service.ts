import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { IncomingSms } from '../types';

/**
 * Stores an inbound SMS against its owning number order. Called from a
 * provider webhook route once a real SMS provider is connected — kept
 * separate from the numbers module so SMS can evolve (delivery receipts,
 * verification-code parsing, etc.) without touching number provisioning.
 */
export async function recordInboundSms(msg: IncomingSms) {
  const admin = createAdminClient();
  const { error } = await admin.from('sms_messages').insert({
    number_order_id: msg.numberOrderId,
    from_number: msg.fromNumber,
    body: msg.body,
    received_at: msg.receivedAt
  });
  if (error) throw error;
}

export async function listMessagesForOrder(numberOrderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('number_order_id', numberOrderId)
    .order('received_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
