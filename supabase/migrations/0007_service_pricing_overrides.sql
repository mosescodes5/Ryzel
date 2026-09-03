-- =========================================================
-- MIGRATION 0007 — per-service (per-product) pricing overrides.
--
-- number_pricing (from 0002) is a single global markup applied to every
-- 5sim product. This adds an optional per-product override — e.g.
-- "whatsapp" always gets +50% while everything else falls back to the
-- global default — so an admin can price hot/scarce products differently
-- from the rest of the catalog without touching code.
--
-- Additive only: new table, no changes to existing ones.
-- =========================================================

create table if not exists public.service_pricing (
  product text primary key, -- 5sim product slug, e.g. 'whatsapp', 'telegram', 'google'
  markup_type text not null default 'percent' check (markup_type in ('percent', 'flat')),
  markup_percent numeric not null default 40,
  markup_flat_cents bigint not null default 0,
  min_price_cents bigint not null default 50,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_pricing enable row level security;

-- Public read, same as number_pricing — needed so the customer-facing
-- catalog can price products correctly. Admin writes go through the
-- service-role client from a server action that calls requireAdmin()
-- first (see src/app/dashboard/admin/pricing/actions.ts) — no public
-- write policy needed, matching the existing number_pricing pattern.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'service_pricing' and policyname = 'service_pricing_public_read'
  ) then
    create policy "service_pricing_public_read" on public.service_pricing for select using (true);
  end if;
end $$;
