-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- before pointing the backend at your Supabase Postgres connection string.
--
-- This replaces the old SQLModel-managed User table: Supabase Auth owns
-- users in its own `auth.users` table, which our app schema does not
-- duplicate. Instead, `wallets.user_id` references `auth.users.id`
-- directly, and a trigger auto-creates a wallet row the moment someone
-- signs up via Supabase Auth (so the backend never needs a "register"
-- endpoint of its own anymore).

create extension if not exists "pgcrypto";

-- ---------- wallets ----------
-- One row per authenticated user. Created automatically by the trigger
-- below; the backend never inserts a row here directly on signup.
create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  wallet_balance_ngn numeric(14, 2) not null default 0,
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

-- Safe to re-run on an existing database that predates these columns.
alter table public.wallets add column if not exists email text;
alter table public.wallets add column if not exists is_admin boolean not null default false;
alter table public.wallets add column if not exists is_suspended boolean not null default false;

alter table public.wallets enable row level security;

-- Only relevant if you ever query these tables directly from the frontend
-- via supabase-js/PostgREST instead of going through the FastAPI backend.
-- The backend itself connects with a direct Postgres connection and isn't
-- subject to RLS, so these policies are a defense-in-depth measure, not
-- what's actually gating access today.
create policy "Users can view their own wallet"
  on public.wallets for select
  using (auth.uid() = user_id);

-- ---------- ledger_entries ----------
create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_ngn numeric(14, 2) not null,
  reason text not null,
  order_id bigint,
  balance_after_ngn numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_user_id_idx on public.ledger_entries (user_id);

alter table public.ledger_entries enable row level security;

create policy "Users can view their own ledger entries"
  on public.ledger_entries for select
  using (auth.uid() = user_id);

-- ---------- orders ----------
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  service text not null,
  country text not null,

  provider_name text not null,
  provider_order_id text not null,
  phone_number text not null,

  cost_usd numeric(10, 4) not null,
  price_ngn numeric(14, 2) not null,

  status text not null default 'pending'
    check (status in ('pending', 'received', 'expired', 'cancelled')),
  sms_code text,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists orders_user_id_idx on public.orders (user_id);

alter table public.orders enable row level security;

create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

-- Now that orders exist, add the FK from ledger_entries.order_id we
-- deferred above (bigint, nullable, no cascade — a ledger row should
-- outlive the order it references for audit purposes).
alter table public.ledger_entries
  add constraint ledger_entries_order_id_fkey
  foreign key (order_id) references public.orders (id);

-- ---------- pending_payments ----------
-- Tracks a Korapay charge from initialization to webhook confirmation.
create table if not exists public.pending_payments (
  id bigint generated always as identity primary key,
  reference text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_ngn numeric(14, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists pending_payments_user_id_idx on public.pending_payments (user_id);

alter table public.pending_payments enable row level security;

create policy "Users can view their own payments"
  on public.pending_payments for select
  using (auth.uid() = user_id);

-- ---------- site_settings ----------
-- Key/value store the admin panel writes to (WhatsApp group link, Telegram
-- channel, support contact, etc). No RLS policies granting access here on
-- purpose — the backend reads/writes it via its direct Postgres connection
-- (not subject to RLS), and it's not meant to be queried from the frontend
-- via supabase-js. Public reads go through GET /settings on the backend,
-- which applies its own defaults for any key not yet set.
create table if not exists public.site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- ---------- invoices ----------
create table if not exists public.invoices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  invoice_number text not null,

  client_name text not null,
  client_email text,
  client_address text,

  currency text not null default 'NGN',
  line_items jsonb not null default '[]'::jsonb,

  tax_percent numeric(5, 2) not null default 0,
  notes text,

  subtotal numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null,
  total numeric(14, 2) not null,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void')),

  issue_date timestamptz not null default now(),
  due_date timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);

alter table public.invoices enable row level security;

create policy "Users can view their own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

-- ---------- shipments (package tracker) ----------
create table if not exists public.shipments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  tracking_code text not null unique,

  carrier_style text not null default 'generic'
    check (carrier_style in ('dhl', 'fedex', 'ups', 'generic')),
  carrier_name text,

  sender_name text,
  recipient_name text,
  origin text,
  destination text,
  package_description text,

  status text not null default 'label_created'
    check (status in ('label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception')),
  estimated_delivery timestamptz,

  events jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipments_user_id_idx on public.shipments (user_id);
create index if not exists shipments_tracking_code_idx on public.shipments (tracking_code);

alter table public.shipments enable row level security;

create policy "Users can view their own shipments"
  on public.shipments for select
  using (auth.uid() = user_id);

-- Deliberately no public-read RLS policy here: the /track/{code} lookup goes
-- through the backend's direct Postgres connection (not subject to RLS,
-- same as everything else in this file), not through supabase-js/PostgREST.
-- If you ever DO want to query shipments straight from the frontend for
-- some reason, you'd need a policy like:
--   create policy "Anyone can view a shipment by its tracking code"
--     on public.shipments for select
--     using (true);
-- ...but that defeats the point of the code being unguessable, so don't.

-- ---------- auto-create wallet on signup ----------
-- Fires whenever Supabase Auth creates a new row in auth.users (i.e. right
-- after someone signs up). This is what replaces the old /auth/register
-- endpoint's job of setting up a wallet for a new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.wallets (user_id, email, wallet_balance_ngn)
  values (new.id, new.email, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
