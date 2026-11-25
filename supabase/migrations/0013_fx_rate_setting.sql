-- =========================================================
-- MIGRATION 0013 — exchange rate you control from the admin dashboard
--
-- Run AFTER 0012. Additive and safe to run twice.
--   * pricing_settings: one row holding "naira per 1 unit of 5sim's price"
--     (the dollar rate) and which currency that unit is (a label for you).
--     Only the server (service role) can read or write it; customers can't.
--   * number_orders.fx_rate: the rate each order was priced with, so your
--     profit history stays explainable after you change the rate.
--
-- ROLLBACK: drop table public.pricing_settings;
--           alter table public.number_orders drop column fx_rate;
-- =========================================================

create table if not exists public.pricing_settings (
  id boolean primary key default true,
  fx_rate_ngn_per_unit numeric(14,4) check (fx_rate_ngn_per_unit is null or fx_rate_ngn_per_unit > 0),
  fx_currency text not null default 'USD',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pricing_settings_singleton check (id)
);

insert into public.pricing_settings (id) values (true) on conflict (id) do nothing;

alter table public.pricing_settings enable row level security;
revoke all on public.pricing_settings from anon, authenticated;
grant select, insert, update on public.pricing_settings to service_role;

alter table public.number_orders
  add column if not exists fx_rate numeric(14,4);

-- ---------------------------------------------------------
-- admin_profit_summary(): profit figures computed in the database, so they stay
-- correct past the 1,000-row limit of the REST API. Only orders that actually
-- delivered a code count as earned; refunded/cancelled/expired orders do not.
-- "Today" uses Lagos time. "held" = paid but not yet delivered or settled.
-- ---------------------------------------------------------
create or replace function public.admin_profit_summary()
returns table (period text, orders bigint, revenue bigint, cost bigint)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select price_cents, cost_cents, created_at
    from public.number_orders
    where status in ('received', 'finished', 'active')
  )
  select 'today'::text, count(*), coalesce(sum(price_cents), 0)::bigint, coalesce(sum(cost_cents), 0)::bigint
    from earned
   where (created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date
  union all
  select 'last_7_days', count(*), coalesce(sum(price_cents), 0)::bigint, coalesce(sum(cost_cents), 0)::bigint
    from earned where created_at >= now() - interval '7 days'
  union all
  select 'last_30_days', count(*), coalesce(sum(price_cents), 0)::bigint, coalesce(sum(cost_cents), 0)::bigint
    from earned where created_at >= now() - interval '30 days'
  union all
  select 'all_time', count(*), coalesce(sum(price_cents), 0)::bigint, coalesce(sum(cost_cents), 0)::bigint
    from earned
  union all
  select 'held', count(*), coalesce(sum(price_cents), 0)::bigint, 0::bigint
    from public.number_orders
   where status in ('purchasing', 'awaiting_sms', 'needs_review');
$$;

revoke execute on function public.admin_profit_summary() from public, anon, authenticated;
grant  execute on function public.admin_profit_summary() to service_role;
