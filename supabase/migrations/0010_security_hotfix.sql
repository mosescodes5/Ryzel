-- =========================================================
-- MIGRATION 0010 — SECURITY HOTFIX (apply immediately)
--
-- Problem: "profiles_update_own" allowed an authenticated user to UPDATE any
-- column of their own profiles row through the public Supabase REST API
-- (anon key + their own JWT). That includes wallet_balance_cents and role,
-- i.e. any user could mint themselves money or become admin.
-- number_orders also allowed client-side INSERT of arbitrary rows.
--
-- Fix: column-level privileges (users may only edit harmless profile fields),
-- a defense-in-depth trigger, no direct client writes to money/order tables,
-- and lock down legacy tables + the rate-limit function.
-- Additive/reversible: only REVOKE/GRANT/POLICY/TRIGGER changes. No data touched.
-- The app only ever writes profiles.notify_phone_number from a user session;
-- every other write already goes through the service-role client.
--
-- ROLLBACK: grant update on public.profiles to authenticated;
--           drop trigger profiles_guard_protected_columns on public.profiles;
-- =========================================================

-- 1) profiles: users may update ONLY display_name / notify_phone_number / updated_at
revoke update, insert, delete on public.profiles from anon, authenticated;
grant update (display_name, notify_phone_number, updated_at) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Defense in depth: even if someone re-grants UPDATE later, client roles can
-- never change identity/role/balance. SECURITY INVOKER on purpose so
-- current_user is the real caller (service_role / SECURITY DEFINER owners pass).
create or replace function public.profiles_guard_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.wallet_balance_cents is distinct from old.wallet_balance_cents then
      raise exception 'Forbidden: protected profile columns can only be changed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_protected_columns();

-- 2) number_orders: clients may only READ their own rows. Orders are created/updated
--    exclusively by server routes (service role).
drop policy if exists "number_orders_insert_own" on public.number_orders;
drop policy if exists "admin_full_access_number_orders" on public.number_orders;
create policy "admin_read_number_orders" on public.number_orders
  for select using (public.is_admin(auth.uid()));
revoke insert, update, delete, truncate on public.number_orders from anon, authenticated;

-- 3) No direct client writes anywhere else that holds money, codes, config or audit data.
revoke insert, update, delete, truncate on
  public.transactions, public.payments, public.sms_messages, public.audit_logs,
  public.number_pricing, public.service_pricing, public.site_settings, public.services,
  public.feature_flags, public.number_inventory, public.packages, public.package_events
from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- 4) increment_rate_limit is SECURITY DEFINER: let only the server call it
--    (otherwise any user can inflate other users' counters => lock them out).
revoke execute on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;

-- 5) Legacy tables present in the live DB but unused by the app (wallets has
--    wallet_balance_ngn + is_admin!). Enable RLS and remove client access.
--    Service role still works. Nothing is dropped.
do $$
declare t text;
begin
  foreach t in array array['wallets', 'ledger_entries', 'orders', 'pending_payments', 'shipments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
