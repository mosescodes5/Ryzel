-- =========================================================
-- SITE SETTINGS: singleton row for admin-editable, site-wide
-- settings that aren't pricing (e.g. the community group link
-- shown on the user dashboard). Same singleton pattern as
-- number_pricing so it needs no per-row lookups.
-- =========================================================

create table if not exists public.site_settings (
  id boolean primary key default true,
  whatsapp_group_link text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

insert into public.site_settings (id, whatsapp_group_link)
values (true, null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Readable by anyone (including logged-out visitors) so the community
-- link/button can render on public pages too, not just the dashboard.
create policy "site_settings_public_read" on public.site_settings
  for select using (true);

-- No insert/update policy for anon/authenticated: writes only ever go
-- through the admin server action, which uses the service-role client
-- (createAdminClient) and bypasses RLS. Keeping this table
-- write-restricted at the DB level means a compromised client-side
-- session still can't rewrite the community link.
