-- =========================================================
-- MIGRATION 0009 — invoice generator, and marking the two tools built in
-- this update ("Invoice Generator", "Package Tracker") live in the
-- services registry so they stop showing "Coming soon" on the homepage.
-- =========================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invoice_number text not null, -- e.g. "INV-0007" — sequential per user, not globally
  customer_name text not null,
  customer_email text,
  business_name text, -- the invoice issuer's own business name, shown on the invoice
  items jsonb not null default '[]'::jsonb, -- [{ description, quantity, unit_price_cents }]
  currency text not null default 'NGN',
  notes text,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  subtotal_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number)
);

create index if not exists invoices_user_id_idx on public.invoices (user_id, created_at desc);

alter table public.invoices enable row level security;

-- Each user manages only their own invoices — this is a personal business
-- tool (unlike packages, which is an admin-run tracker for RYZEL's own
-- shipments), so ordinary users get full read/write on rows they own.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_owner_all'
  ) then
    create policy "invoices_owner_all" on public.invoices for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

update public.services
set active = true,
    name = 'Invoice Generator',
    description = 'Create and send professional invoices to your customers.'
where slug = 'invoice-generator';

update public.services
set active = true,
    name = 'Package Tracker',
    description = 'Give customers a tracking link and update delivery status by hand.'
where slug = 'delivery-tracker';

update public.feature_flags set enabled = true where key = 'invoice_generator_enabled';
update public.feature_flags set enabled = true where key = 'delivery_tracker_enabled';
