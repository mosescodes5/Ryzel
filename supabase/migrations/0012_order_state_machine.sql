-- =========================================================
-- MIGRATION 0012 — number order state machine (money-safe purchases)
--
-- Run AFTER 0010 and 0011. Additive: no existing rows are changed.
-- All money stays in whole NAIRA (the *_cents column names are legacy only).
--
-- What this adds:
--   * new order states: 'purchasing' (wallet already debited, provider call
--     in flight or outcome unknown) and 'needs_review' (needs a human)
--   * order_reserve(): debit the wallet AND create the order row in ONE
--     transaction, so a charge can never exist without an order row
--   * order_refund():  refund an order EXACTLY ONCE, however many times the
--     poller, the customer, or a retry calls it
--
-- ROLLBACK (only if no 'purchasing'/'needs_review' orders exist):
--   drop function public.order_reserve(uuid, bigint, text, text, text, text);
--   drop function public.order_refund(uuid, text, text);
-- =========================================================

-- 1. Allow the two new statuses (drop whatever status check exists, by definition).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.number_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.number_orders drop constraint %I', c);
  end loop;
end $$;

alter table public.number_orders
  add constraint number_orders_status_check check (
    status in ('purchasing', 'awaiting_sms', 'received', 'active', 'finished',
               'cancelled', 'expired', 'failed', 'needs_review')
  );

alter table public.number_orders
  add column if not exists purchase_started_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists review_note text;

-- The poller scans these two states constantly.
create index if not exists number_orders_purchasing_idx
  on public.number_orders (purchase_started_at)
  where status = 'purchasing';

-- 2. order_reserve: charge + create the order atomically.
create or replace function public.order_reserve(
  p_user     uuid,
  p_price    bigint,
  p_provider text,
  p_country  text,
  p_operator text,
  p_product  text
)
returns table (order_id uuid, new_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid := gen_random_uuid();
  v_bal bigint;
begin
  if p_price is null or p_price <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Raises INSUFFICIENT_FUNDS / WALLET_NOT_FOUND; the ledger row points at the order id.
  select w.new_balance into v_bal
  from public.wallet_apply(p_user, 'debit', p_price, 'number_purchase',
                           'number_orders', v_id, 'purchase:' || v_id::text) w;

  insert into public.number_orders
    (id, user_id, provider, country, operator, product, status,
     price_cents, cost_cents, purchase_started_at)
  values
    (v_id, p_user, p_provider, p_country, p_operator, p_product, 'purchasing',
     p_price, 0, now());

  return query select v_id, v_bal;
end;
$$;

-- 3. order_refund: refund once, set the final status in the same transaction.
--    Outcomes: refunded | already_refunded | not_refundable | not_found
create or replace function public.order_refund(
  p_order        uuid,
  p_final_status text,
  p_reason       text
)
returns table (outcome text, refunded bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.number_orders%rowtype;
begin
  if p_final_status not in ('cancelled', 'expired', 'failed') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into o from public.number_orders where id = p_order for update;
  if not found then
    return query select 'not_found'::text, 0::bigint;
    return;
  end if;

  if o.refunded_at is not null then
    return query select 'already_refunded'::text, 0::bigint;
    return;
  end if;

  -- A delivered code is never refunded.
  if o.status in ('received', 'finished') then
    return query select 'not_refundable'::text, 0::bigint;
    return;
  end if;

  -- Belt and braces: the idempotency key also stops a double credit.
  perform public.wallet_apply(o.user_id, 'credit', o.price_cents, p_reason,
                              'number_orders', o.id, 'order_refund:' || o.id::text);

  update public.number_orders
     set status = p_final_status, refunded_at = now(), updated_at = now()
   where id = o.id;

  return query select 'refunded'::text, o.price_cents;
end;
$$;

revoke execute on function public.order_reserve(uuid, bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.order_refund(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.order_reserve(uuid, bigint, text, text, text, text) to service_role;
grant  execute on function public.order_refund(uuid, text, text) to service_role;
