import { createAdminClient } from '@/lib/supabase/server';

type DebitArgs = {
  userId: string;
  amountCents: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
};

/**
 * Every product on the platform (numbers today; invoices, tracking, etc.
 * later) spends from the same wallet through this one lib, instead of each
 * module rolling its own balance logic. Runs with the service-role client
 * because it mutates balances outside RLS — only call from trusted server
 * code (route handlers / server actions), never from the client.
 */
export async function debitWallet({ userId, amountCents, reason, referenceType, referenceId }: DebitArgs) {
  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('wallet_balance_cents')
    .eq('id', userId)
    .single();

  if (profileError || !profile) throw new Error('Could not load wallet balance');
  if (profile.wallet_balance_cents < amountCents) {
    throw new Error('Insufficient wallet balance');
  }

  const newBalance = profile.wallet_balance_cents - amountCents;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ wallet_balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) throw updateError;

  const { error: txError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'debit',
    amount_cents: amountCents,
    reason,
    reference_type: referenceType,
    reference_id: referenceId
  });

  if (txError) throw txError;

  return { newBalanceCents: newBalance };
}

export async function creditWallet({ userId, amountCents, reason, referenceType, referenceId }: DebitArgs) {
  const supabase = createAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('wallet_balance_cents')
    .eq('id', userId)
    .single();

  if (profileError || !profile) throw new Error('Could not load wallet balance');

  const newBalance = profile.wallet_balance_cents + amountCents;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ wallet_balance_cents: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) throw updateError;

  const { error: txError } = await supabase.from('transactions').insert({
    user_id: userId,
    type: 'credit',
    amount_cents: amountCents,
    reason,
    reference_type: referenceType,
    reference_id: referenceId
  });

  if (txError) throw txError;

  return { newBalanceCents: newBalance };
}
