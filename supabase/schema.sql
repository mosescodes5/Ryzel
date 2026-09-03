-- =========================================================
-- RYZEL PLATFORM SCHEMA
-- Shared platform tables + product-specific tables.
-- Per architecture doc: no single giant table for everything.
-- =========================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- SHARED: profiles (extends auth.users)
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  wallet_balance_cents bigint not null default 0,
  notify_phone_number text, -- where Brevo sends "you got a code" SMS alerts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user (covers OAuth/magic
-- link signups too, not just the app's own signup form).
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

-- ---------------------------------------------------------
-- SHARED: services registry (drives Marketplace/Tools nav + admin)
-- ---------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  description text,
  category text not null check (
    category in ('marketplace', 'communication', 'business_tools', 'logistics', 'travel', 'documents')
  ),
  icon text,
  type text not null check (type in ('marketplace', 'tool')),
  active boolean not null default false,
  requires_auth boolean not null default true,
  pricing_type text not null default 'free' check (
    pricing_type in ('free', 'one_time', 'usage', 'subscription', 'credits')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SHARED: feature flags
-- ---------------------------------------------------------
create table if not exists public.feature_flags (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SHARED: transactions (wallet ledger — every credit/debit)
-- ---------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('credit', 'debit')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  reason text not null, -- e.g. 'wallet_topup', 'number_purchase', 'refund'
  reference_type text,  -- e.g. 'number_orders'
  reference_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SHARED: payments (external payment provider records)
-- ---------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'mock',
  provider_reference text unique,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SHARED: audit logs
-- ---------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- NUMBERS PRODUCT: inventory, orders
-- ---------------------------------------------------------
create table if not exists public.number_inventory (
  id uuid primary key default uuid_generate_v4(),
  provider text not null default 'mock',
  provider_number_id text, -- id in the upstream provider's system
  phone_number text not null unique,
  country_code text not null,
  area_code text,
  monthly_price_cents bigint not null,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.number_orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  number_id uuid references public.number_inventory(id), -- null for live-provisioned (5sim) numbers
  provider text not null default '5sim',
  provider_order_id text,
  phone_number text,
  country text,
  operator text,
  product text, -- e.g. 'telegram', 'whatsapp', 'google' — the service the number verifies
  status text not null default 'awaiting_sms' check (
    status in ('awaiting_sms', 'received', 'active', 'finished', 'cancelled', 'expired', 'failed')
  ),
  price_cents bigint not null,       -- what the customer paid
  cost_cents bigint not null default 0, -- what RYZEL paid the provider — price_cents - cost_cents = profit
  renews_at timestamptz,
  expires_at timestamptz, -- when the provider's code window closes; the poller uses this
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists number_orders_provider_ref_uidx
  on public.number_orders (provider, provider_order_id)
  where provider_order_id is not null;

create index if not exists number_orders_awaiting_idx
  on public.number_orders (status, last_checked_at)
  where status = 'awaiting_sms';

-- ---------------------------------------------------------
-- SMS PRODUCT
-- ---------------------------------------------------------
create table if not exists public.sms_messages (
  id uuid primary key default uuid_generate_v4(),
  number_order_id uuid not null references public.number_orders(id) on delete cascade,
  from_number text,
  body text,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- PRICING: admin-adjustable markup applied on top of provider cost
-- ---------------------------------------------------------
create table if not exists public.number_pricing (
  id boolean primary key default true, -- singleton row
  markup_type text not null default 'percent' check (markup_type in ('percent', 'flat')),
  markup_percent numeric not null default 40,
  markup_flat_cents bigint not null default 0,
  min_price_cents bigint not null default 50,
  updated_at timestamptz not null default now(),
  constraint number_pricing_singleton check (id)
);

-- Seeded from this deployment's configured MARKUP_PERCENT / MARKUP_FLAT_NGN /
-- MIN_PRICE_NGN (major-unit NGN, converted to kobo here) — adjust anytime
-- from /admin/pricing without needing a redeploy.
insert into public.number_pricing (id, markup_type, markup_percent, markup_flat_cents, min_price_cents)
values (true, 'percent', 45, 5000, 15000)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- SHARED: site settings (singleton row for misc admin-editable
-- settings, e.g. the community WhatsApp group link shown on the
-- user dashboard). See migrations/0006_site_settings.sql.
-- ---------------------------------------------------------
create table if not exists public.site_settings (
  id boolean primary key default true,
  whatsapp_group_link text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

insert into public.site_settings (id, whatsapp_group_link)
values (true, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- RATE LIMITING: generic fixed-window counter for user-triggered
-- endpoints that cost money or hit a paid third-party API.
-- ---------------------------------------------------------
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.increment_rate_limit(p_key text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.payments enable row level security;
alter table public.number_orders enable row level security;
alter table public.sms_messages enable row level security;
alter table public.services enable row level security;
alter table public.feature_flags enable row level security;
alter table public.number_inventory enable row level security;
alter table public.audit_logs enable row level security;
alter table public.number_pricing enable row level security;
alter table public.rate_limits enable row level security;
-- No public policies on rate_limits — only touched via the service-role
-- client through the increment_rate_limit() function above.

-- profiles: user reads/updates only their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- transactions/payments: user reads only their own
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);

-- number_orders: user reads/writes only their own
create policy "number_orders_select_own" on public.number_orders
  for select using (auth.uid() = user_id);
create policy "number_orders_insert_own" on public.number_orders
  for insert with check (auth.uid() = user_id);

-- sms_messages: readable if the parent order belongs to the user
create policy "sms_messages_select_own" on public.sms_messages
  for select using (
    exists (
      select 1 from public.number_orders o
      where o.id = number_order_id and o.user_id = auth.uid()
    )
  );

-- services/feature_flags/number_inventory: public read (catalog data)
create policy "services_public_read" on public.services
  for select using (true);
create policy "feature_flags_public_read" on public.feature_flags
  for select using (true);
create policy "number_inventory_public_read" on public.number_inventory
  for select using (status = 'available');
create policy "number_pricing_public_read" on public.number_pricing
  for select using (true);

alter table public.site_settings enable row level security;

create policy "site_settings_public_read" on public.site_settings
  for select using (true);

-- number_orders: admin can read/update every order (used by the admin
-- orders/profit page). Regular users keep their own-row-only policies above.
--
-- is_admin() is a SECURITY DEFINER function, not an inline
-- `exists (select ... from profiles)`. A policy on `profiles` that queries
-- `profiles` directly re-triggers its own RLS evaluation — infinite
-- recursion. The function runs as its owner (bypassing RLS for that one
-- lookup) instead of as the querying role, which breaks the cycle.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

create policy "admin_full_access_number_orders" on public.number_orders
  for all using (public.is_admin(auth.uid()));

-- Admin override: profiles.role = 'admin' can do everything.
-- (Simplest approach for MVP — service-role key is used for admin writes
--  from trusted server routes instead of relying solely on this policy.)
create policy "admin_full_access_profiles" on public.profiles
  for all using (public.is_admin(auth.uid()));

-- =========================================================
-- SEED: starter services + flags (numbers live, everything else "coming soon")
-- =========================================================
insert into public.services (name, slug, description, category, icon, type, active, pricing_type)
values
  ('Virtual Numbers', 'virtual-numbers', 'Get a virtual number and receive SMS online.', 'marketplace', 'phone', 'marketplace', true, 'one_time'),
  ('SMS Verification', 'sms-verification', 'Receive SMS verification codes.', 'communication', 'message-square', 'marketplace', false, 'usage'),
  ('Invoice Generator', 'invoice-generator', 'Create professional invoices in seconds.', 'business_tools', 'file-text', 'tool', false, 'free'),
  ('Receipt Generator', 'receipt-generator', 'Create and manage digital receipts.', 'business_tools', 'receipt', 'tool', false, 'free'),
  ('Delivery Tracker', 'delivery-tracker', 'Track shipments from multiple carriers.', 'logistics', 'truck', 'tool', false, 'free'),
  ('Flight Itinerary', 'flight-itinerary', 'Create organized travel itineraries.', 'travel', 'plane', 'tool', false, 'free')
on conflict (slug) do nothing;

insert into public.feature_flags (key, enabled)
values
  ('numbers_enabled', true),
  ('sms_verification_enabled', false),
  ('invoice_generator_enabled', false),
  ('receipt_generator_enabled', false),
  ('delivery_tracker_enabled', false),
  ('flight_itinerary_enabled', false)
on conflict (key) do nothing;
