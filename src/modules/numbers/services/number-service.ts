import { createAdminClient, createClient } from '@/lib/supabase/server';
import { debitWallet } from '@/lib/payments/wallet';
import { getNumberProvider } from '../providers/provider-manager';

export async function searchAvailableNumbers(params: { countryCode: string; areaCode?: string }) {
  const provider = getNumberProvider();
  return provider.searchAvailableNumbers(params);
}

export async function listInventoryFromDb() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('number_inventory')
    .select('*')
    .eq('status', 'available')
    .order('monthly_price_cents');

  if (error) throw error;
  return data ?? [];
}

/**
 * Purchases a number for a user: debits the wallet, marks inventory sold,
 * and creates the order — all as one logical unit. If any step fails after
 * the debit, the debit is reversed so the user isn't charged for nothing.
 */
export async function purchaseNumber({ userId, numberInventoryId }: { userId: string; numberInventoryId: string }) {
  const admin = createAdminClient();

  const { data: inventoryItem, error: inventoryError } = await admin
    .from('number_inventory')
    .select('*')
    .eq('id', numberInventoryId)
    .eq('status', 'available')
    .single();

  if (inventoryError || !inventoryItem) {
    throw new Error('This number is no longer available.');
  }

  await debitWallet({
    userId,
    amountCents: inventoryItem.monthly_price_cents,
    reason: 'number_purchase',
    referenceType: 'number_inventory',
    referenceId: inventoryItem.id
  });

  try {
    const { data: order, error: orderError } = await admin
      .from('number_orders')
      .insert({
        user_id: userId,
        number_id: inventoryItem.id,
        price_cents: inventoryItem.monthly_price_cents,
        renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (orderError) throw orderError;

    await admin.from('number_inventory').update({ status: 'sold' }).eq('id', inventoryItem.id);

    return order;
  } catch (err) {
    // Roll back the charge if order creation failed after debiting.
    const { creditWallet } = await import('@/lib/payments/wallet');
    await creditWallet({
      userId,
      amountCents: inventoryItem.monthly_price_cents,
      reason: 'number_purchase_refund',
      referenceType: 'number_inventory',
      referenceId: inventoryItem.id
    });
    throw err;
  }
}

export async function listOrdersForUser(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('number_orders')
    .select('*, number_inventory(phone_number, country_code)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
