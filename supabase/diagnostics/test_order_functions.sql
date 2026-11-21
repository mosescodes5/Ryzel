-- =========================================================
-- Proves order_reserve / order_refund behave, on your REAL database, with ZERO
-- lasting effect: everything runs inside a transaction that is ROLLED BACK.
-- Run in the Supabase SQL editor AFTER 0012. The result table must show PASS on every row.
-- Replace nothing: it picks any existing profile as the guinea pig.
-- =========================================================
begin;

create temp table _t (step text, result text) on commit drop;

do $$
declare
  u uuid;
  bal0 bigint; bal1 bigint; bal2 bigint; bal3 bigint;
  oid uuid;
  r record;
  n int;
begin
  select id into u from public.profiles order by created_at limit 1;
  if u is null then raise exception 'no profile to test with'; end if;

  select wallet_balance_cents into bal0 from public.profiles where id = u;
  perform public.wallet_apply(u, 'credit', 1000, 'TEST_credit', null, null, 'TEST:' || u::text);

  -- 1. reserve debits and creates the order together
  select * into r from public.order_reserve(u, 300, '5sim', 'nigeria', 'any', 'telegram');
  oid := r.order_id;
  select wallet_balance_cents into bal1 from public.profiles where id = u;
  insert into _t values ('reserve debited 300 and created order', case when bal1 = bal0 + 1000 - 300 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.number_orders where id = oid and status = 'purchasing' and price_cents = 300;
  insert into _t values ('order exists as purchasing', case when n = 1 then 'PASS' else 'FAIL' end);

  -- 2. refund once credits back
  select * into r from public.order_refund(oid, 'failed', 'TEST_refund');
  select wallet_balance_cents into bal2 from public.profiles where id = u;
  insert into _t values ('first refund = refunded', case when r.outcome = 'refunded' and r.refunded = 300 and bal2 = bal0 + 1000 then 'PASS' else 'FAIL' end);

  -- 3. refund again (and again) does nothing
  perform public.order_refund(oid, 'expired', 'TEST_refund');
  select * into r from public.order_refund(oid, 'cancelled', 'TEST_refund');
  select wallet_balance_cents into bal3 from public.profiles where id = u;
  insert into _t values ('repeat refunds are no-ops', case when r.outcome = 'already_refunded' and bal3 = bal2 then 'PASS' else 'FAIL' end);

  -- 4. a delivered code is never refunded
  select * into r from public.order_reserve(u, 200, '5sim', 'nigeria', 'any', 'telegram');
  update public.number_orders set status = 'received' where id = r.order_id;
  select * into r from public.order_refund(r.order_id, 'cancelled', 'TEST_refund');
  insert into _t values ('received order not refundable', case when r.outcome = 'not_refundable' then 'PASS' else 'FAIL' end);

  -- 5. insufficient funds blocks the order entirely (no order row, no debit)
  begin
    perform public.order_reserve(u, 999999999, '5sim', 'nigeria', 'any', 'telegram');
    insert into _t values ('oversized reserve refused', 'FAIL - it should have been refused');
  exception when others then
    insert into _t values ('oversized reserve refused', case when sqlerrm like '%INSUFFICIENT_FUNDS%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;
end $$;

-- Read the results BEFORE rolling back. Every row must say PASS.
select * from _t;

rollback;  -- nothing above is kept
