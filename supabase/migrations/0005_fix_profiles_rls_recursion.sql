-- =========================================================
-- MIGRATION 0005 — fix "infinite recursion detected in policy for
-- relation profiles".
--
-- Root cause: admin_full_access_profiles (on profiles) and
-- admin_full_access_number_orders (on number_orders) both checked admin
-- status with `exists (select 1 from public.profiles where ...)`. That
-- inner select on profiles has to itself pass through profiles' RLS —
-- which includes admin_full_access_profiles — which runs the same
-- select again. Infinite recursion.
--
-- Fix: a SECURITY DEFINER function checks admin status without
-- re-entering RLS (it runs as the function owner, not the caller).
-- Standard Supabase pattern for "is this user an admin" checks.
-- =========================================================

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

drop policy if exists "admin_full_access_profiles" on public.profiles;
create policy "admin_full_access_profiles" on public.profiles
  for all using (public.is_admin(auth.uid()));

drop policy if exists "admin_full_access_number_orders" on public.number_orders;
create policy "admin_full_access_number_orders" on public.number_orders
  for all using (public.is_admin(auth.uid()));
