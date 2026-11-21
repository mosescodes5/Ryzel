-- =========================================================
-- MIGRATION 0011 — ATOMIC WALLET + IDEMPOTENT PAYMENT SETTLEMENT
--
-- Fixes (all in src/lib/payments/wallet.ts + wallet webhook/verify routes):
--  1. Read-modify-write balance updates (two concurrent purchases both pass the
--     balance check => overspend; two concurrent credits => lost update).
--  2. Webhook + redirect-verify both crediting the same Korapay payment
--     (no lock, no unique ledger key => double credit).
--  3. Verified Korapay amount/currency was never compared to the payment row.
--  4. Refunds had no idempotency key (retry / double-click => double refund).
--
-- Additive only: new nullable columns, a partial unique index, new functions.
-- Units: "wallet units" exactly as stored today in the *_cents columns
-- (whole naira, per the note in korapay-provider.ts). Nothing is rescaled.
--
-- ROLLBACK: drop function public.settle_payment(text, numeric, text);
--           drop function public.wallet_apply(uuid, text, bigint, text, text, uuid, text);
--           drop view public.wallet_ledger_drift;  (columns/index can stay)
-- =========================================================

alter table public.transactions
  add column if not exists idempotency_key text,
  add column if not exists balance_after_cents bigint;

create unique index if not exists transactions_idempotency_key_uidx
  on public.transactions (idempotency_key) where idempotency_key is not null;

alter table public.payments
  add column if not exists settled_at timestamptz;

-- ---------------------------------------------------------
-- wallet_apply: the ONLY way balances change.
--   * locks the wallet row (serialises all movements per user)
--   * replays of the same idempotency key are no-ops (applied = false)
--   * debits fail with INSUFFICIENT_FUNDS instead of going negative
--   * writes the ledger row and the new balance in one transaction
-- ---------------------------------------------------------
create or replace function public.wallet_apply(
  p_user     uuid,
  p_type     text,
  p_amount   bigint,
  p_reason   text,
  p_ref_type text default null,
  p_ref_id   uuid default null,
  p_key      text default null
)
returns table (new_balance bigint, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal bigint;
begin
  if p_type not in ('credit', 'debit') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Lock FIRST, check idempotency SECOND: concurrent calls with the same key
  -- queue here, so the loser sees the winner's committed ledger row.
  select wallet_balance_cents into v_bal from public.profiles where id = p_user for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if p_key is not null and exists (select 1 from public.transactions where idempotency_key = p_key) then
    return query select v_bal, false;
    return;
  end if;

  if p_type = 'debit' then
    if v_bal < p_amount then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;
    v_bal := v_bal - p_amount;
  else
    v_bal := v_bal + p_amount;
  end if;

  update public.profiles set wallet_balance_cents = v_bal, updated_at = now() where id = p_user;

  insert into public.transactions
    (user_id, type, amount_cents, currency, reason, reference_type, reference_id, idempotency_key, balance_after_cents)
  values
    (p_user, p_type, p_amount, 'NGN', p_reason, p_ref_type, p_ref_id, p_key, v_bal);

  return query select v_bal, true;
end;
$$;

-- ---------------------------------------------------------
-- settle_payment: credit a top-up exactly once, atomically.
-- Caller must have verified the charge SERVER-TO-SERVER with Korapay first and
-- passes the amount/currency Korapay reported. The credited amount always comes
-- from OUR payments row. Outcomes:
--   settled | already_settled | not_found | amount_mismatch | not_settleable
-- ---------------------------------------------------------
create or replace function public.settle_payment(
  p_reference         text,
  p_verified_amount   numeric,
  p_verified_currency text
)
returns table (outcome text, new_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay     public.payments%rowtype;
  v_bal     bigint;
  v_applied boolean;
begin
  select * into v_pay from public.payments where provider_reference = p_reference for update;
  if not found then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;

  if v_pay.status = 'succeeded' then
    return query select 'already_settled'::text, null::bigint;
    return;
  end if;

  if v_pay.status = 'refunded' then
    return query select 'not_settleable'::text, null::bigint;
    return;
  end if;

  -- 'pending' or 'failed' (a late success after a premature failed mark) can settle,
  -- but only if what Korapay says was paid matches what we asked for.
  if p_verified_amount is distinct from v_pay.amount_cents::numeric
     or upper(coalesce(p_verified_currency, '')) is distinct from upper(v_pay.currency) then
    insert into public.audit_logs (action, target_type, target_id, metadata)
    values ('payment.amount_mismatch', 'payments', v_pay.id,
            jsonb_build_object('reference', p_reference,
                               'expected_amount', v_pay.amount_cents, 'expected_currency', v_pay.currency,
                               'verified_amount', p_verified_amount, 'verified_currency', p_verified_currency));
    return query select 'amount_mismatch'::text, null::bigint;
    return;
  end if;

  select w.new_balance, w.applied into v_bal, v_applied
  from public.wallet_apply(v_pay.user_id, 'credit', v_pay.amount_cents, 'wallet_topup',
                           'payments', v_pay.id, 'topup:' || v_pay.id::text) w;

  update public.payments set status = 'succeeded', settled_at = now(), updated_at = now() where id = v_pay.id;

  return query select 'settled'::text, v_bal;
end;
$$;

-- Server-only. (service_role keeps access; clients get nothing.)
revoke execute on function public.wallet_apply(uuid, text, bigint, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.settle_payment(text, numeric, text) from public, anon, authenticated;
grant  execute on function public.wallet_apply(uuid, text, bigint, text, text, uuid, text) to service_role;
grant  execute on function public.settle_payment(text, numeric, text) to service_role;

-- ---------------------------------------------------------
-- Reconciliation: balance vs ledger. Rows with drift <> 0 need a look
-- (expected for pre-0011 history if any credits were granted without a ledger row).
-- ---------------------------------------------------------
create or replace view public.wallet_ledger_drift with (security_invoker = true) as
select p.id as user_id,
       p.wallet_balance_cents as balance,
       coalesce(sum(case when t.type = 'credit' then t.amount_cents else -t.amount_cents end), 0)::bigint as ledger_sum,
       p.wallet_balance_cents
         - coalesce(sum(case when t.type = 'credit' then t.amount_cents else -t.amount_cents end), 0)::bigint as drift
from public.profiles p
left join public.transactions t on t.user_id = p.id
group by p.id, p.wallet_balance_cents;

revoke all on public.wallet_ledger_drift from public, anon, authenticated;
grant select on public.wallet_ledger_drift to service_role;
