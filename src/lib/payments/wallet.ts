import { createAdminClient } from '@/lib/supabase/server';

type WalletMoveArgs = {
  userId: string;
  amountCents: number; // wallet units, exactly as stored in profiles.wallet_balance_cents
  reason: string;
  referenceType?: string;
  referenceId?: string;
  /**
   * Makes the movement safe to retry: the same key is applied at most once, ever.
   * ALWAYS pass one for refunds and for anything triggered by a webhook/retryable request.
   */
  idempotencyKey?: string;
};

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient wallet balance');
    this.name = 'InsufficientFundsError';
  }
}

/**
 * Every product on the platform spends from the same wallet through this one lib.
 * Balance changes happen ONLY inside the wallet_apply() Postgres function
 * (migration 0011), which row-locks the wallet, enforces non-negative balance and
 * writes the ledger row in the same transaction. Never update
 * profiles.wallet_balance_cents from application code.
 * Server-only (service role).
 */
async function applyMove(type: 'credit' | 'debit', a: WalletMoveArgs) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('wallet_apply', {
    p_user: a.userId,
    p_type: type,
    p_amount: a.amountCents,
    p_reason: a.reason,
    p_ref_type: a.referenceType ?? null,
    p_ref_id: a.referenceId ?? null,
    p_key: a.idempotencyKey ?? null
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_FUNDS')) throw new InsufficientFundsError();
    if (error.message.includes('WALLET_NOT_FOUND')) throw new Error('Could not load wallet balance');
    throw new Error(`Wallet ${type} failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`Wallet ${type} returned no result`);

  return { newBalanceCents: Number(row.new_balance), applied: Boolean(row.applied) };
}

export function debitWallet(args: WalletMoveArgs) {
  return applyMove('debit', args);
}

export function creditWallet(args: WalletMoveArgs) {
  return applyMove('credit', args);
}

export type SettleOutcome = 'settled' | 'already_settled' | 'not_found' | 'amount_mismatch' | 'not_settleable';

/**
 * Credits a verified Korapay top-up exactly once (webhook and redirect-verify can race
 * safely). Caller MUST have verified the charge server-to-server first and passes what
 * Korapay reported; the credited amount always comes from our own payments row.
 */
export async function settlePayment(args: {
  reference: string;
  verifiedAmount: number;
  verifiedCurrency: string;
}): Promise<{ outcome: SettleOutcome; newBalanceCents: number | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('settle_payment', {
    p_reference: args.reference,
    p_verified_amount: args.verifiedAmount,
    p_verified_currency: args.verifiedCurrency
  });
  if (error) throw new Error(`Payment settlement failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Payment settlement returned no result');

  return {
    outcome: row.outcome as SettleOutcome,
    newBalanceCents: row.new_balance === null ? null : Number(row.new_balance)
  };
}
