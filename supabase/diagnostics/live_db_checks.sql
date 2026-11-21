-- Run in the Supabase SQL editor on the LIVE project. Read-only. Paste results back to me.
-- 1) Is the exploit open right now? (look for profiles_update_own and UPDATE grants)
select policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='profiles';
select grantee, privilege_type, column_name from information_schema.column_privileges
 where table_schema='public' and table_name='profiles' and grantee in ('anon','authenticated') and privilege_type='UPDATE' order by column_name;
-- 2) Tables in public WITHOUT row level security (anything listed here is world-readable/writable via the anon key)
select c.relname as table_without_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1;
-- 3) Who is admin? (expect exactly the people you know)
select id, email, role, wallet_balance_cents, updated_at from public.profiles where role='admin';
select user_id, email, is_admin, wallet_balance_ngn from public.wallets where is_admin = true;   -- legacy table, may not exist
-- 4) Unusually large or recently-edited balances (possible past abuse)
select id, wallet_balance_cents, updated_at from public.profiles order by wallet_balance_cents desc limit 10;
-- 5) Unit check for the cost/price scale question: last 10 orders (no personal data)
select price_cents, cost_cents, status, created_at from public.number_orders order by created_at desc limit 10;
-- 6) Payments credited more than once? (same payment id credited in several ledger rows)
select reference_id, count(*) as credits from public.transactions
 where reason='wallet_topup' and reference_id is not null group by 1 having count(*) > 1;
-- 7) Ledger vs balance drift (after 0011 is applied)
select * from public.wallet_ledger_drift where drift <> 0 order by abs(drift) desc limit 20;
