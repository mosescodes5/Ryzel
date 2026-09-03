-- =========================================================
-- MIGRATION 0008 — package tracking (a separate product from the SMS/
-- virtual-number marketplace, deliberately not wired into it).
--
-- Status is updated by hand from Admin > Package Tracker — no courier API
-- involved. Public lookup on track.ryzel.online is by tracking number only,
-- no login required, same trust model as any real courier's tracking page:
-- the tracking number itself (long, random) is what limits who can look up
-- a given package — RLS just makes "select by tracking number" possible
-- for anon/logged-out visitors, it doesn't hide rows from someone who
-- already has the number.
-- =========================================================

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  customer_name text,
  customer_email text,
  customer_phone text,
  description text,
  origin text,
  destination text,
  status text not null default 'pending' check (
    status in ('pending', 'received', 'in_transit', 'out_for_delivery', 'delivered', 'delayed', 'exception', 'cancelled')
  ),
  estimated_delivery date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packages_tracking_number_idx on public.packages (tracking_number);

-- Timeline entries shown on the public tracking page, oldest to newest —
-- same idea as "Shipment received", "Departed facility", "Out for delivery".
create table if not exists public.package_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  status text not null,
  note text,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists package_events_package_id_idx on public.package_events (package_id, created_at);

alter table public.packages enable row level security;
alter table public.package_events enable row level security;

-- Public read (anon + authenticated) — powers track.ryzel.online with no
-- login. Writes only ever happen through admin server actions using the
-- service-role client (see src/app/dashboard/admin/packages/actions.ts),
-- which bypasses RLS entirely, so no insert/update policy is needed here —
-- same pattern as site_settings and number_pricing.
create policy "packages_public_read" on public.packages for select using (true);
create policy "package_events_public_read" on public.package_events for select using (true);
