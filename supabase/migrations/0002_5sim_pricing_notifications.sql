-- =========================================================
-- MIGRATION 0002 — 5sim activation numbers, admin pricing/markup,
-- profit tracking, Brevo notification phone, auto-profile creation.
--
-- Safe to run against an existing RYZEL Supabase project (yours already
-- has users) — everything here is additive: new nullable columns, new
-- tables, `if not exists` / `do $$ ... $$` guards. Nothing drops or
-- rewrites existing data.
-- =========================================================

-- ---------------------------------------------------------
-- profiles: number to notify via Brevo SMS, optional
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists notify_phone_number text;

-- ---------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- Replaces the old "insert profile from the client after signUp()"
-- approach — this also backfills anyone who signed up before this
-- trigger existed (OAuth, magic link, or the old client-side path).
-- ---------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill: create profile rows for existing auth users who don't have one.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------
-- number_orders: extend to support live-provisioned activation
-- numbers (5sim) instead of only pre-seeded DB inventory.
-- number_id becomes optional — 5sim orders won't have one.
-- ---------------------------------------------------------
alter table public.number_orders
  alter column number_id drop not null;

alter table public.number_orders
  add column if not exists provider text not null default '5sim',
  add column if not exists provider_order_id text,
  add column if not exists phone_number text,
  add column if not exists country text,
  add column if not exists operator text,
  add column if not exists product text,
  add column if not exists cost_cents bigint not null default 0, -- what RYZEL paid the provider
  add column if not exists last_checked_at timestamptz;

-- price_cents (existing column) is what the customer paid — profit for
-- an order is price_cents - cost_cents. Keep both on the row so profit
-- is never dependent on the provider's price changing later.

create unique index if not exists number_orders_provider_ref_uidx
  on public.number_orders (provider, provider_order_id)
  where provider_order_id is not null;

-- Broaden status to cover the activation lifecycle (awaiting SMS, code
-- received, expired, cancelled) instead of only the old rental states.
alter table public.number_orders drop constraint if exists number_orders_status_check;
alter table public.number_orders
  add constraint number_orders_status_check
  check (status in ('awaiting_sms', 'received', 'active', 'finished', 'cancelled', 'expired', 'failed'));

-- ---------------------------------------------------------
-- Admin-adjustable pricing: a single markup rule applied on top of
-- whatever the provider (5sim) charges RYZEL, so numbers are sold at a
-- profit. Kept as one editable row rather than a key/value table so the
-- admin pricing page is a simple form, not a settings-table editor.
-- ---------------------------------------------------------
create table if not exists public.number_pricing (
  id boolean primary key default true, -- singleton row (id is always true)
  markup_type text not null default 'percent' check (markup_type in ('percent', 'flat')),
  markup_percent numeric not null default 40,   -- used when markup_type = 'percent'
  markup_flat_cents bigint not null default 0,  -- used when markup_type = 'flat'
  min_price_cents bigint not null default 50,   -- price floor regardless of provider cost
  updated_at timestamptz not null default now(),
  constraint number_pricing_singleton check (id)
);

insert into public.number_pricing (id, markup_type, markup_percent, markup_flat_cents, min_price_cents)
values (true, 'percent', 45, 5000, 15000)
on conflict (id) do nothing;

alter table public.number_pricing enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'number_pricing' and policyname = 'number_pricing_public_read'
  ) then
    create policy "number_pricing_public_read" on public.number_pricing for select using (true);
  end if;
end $$;

-- Admin writes to number_pricing go through the service-role client from
-- a server action that calls requireAdmin() first (see
-- src/app/admin/pricing/actions.ts) — no public write policy needed.

-- ---------------------------------------------------------
-- RLS: allow admins to update number_orders (for manual status fixes)
-- and read all of them from the admin orders page. Reads from the admin
-- UI go through the service-role client, so this is a safety net rather
-- than the primary access path.
-- ---------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'number_orders' and policyname = 'admin_full_access_number_orders'
  ) then
    create policy "admin_full_access_number_orders" on public.number_orders
      for all using (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      );
  end if;
end $$;
