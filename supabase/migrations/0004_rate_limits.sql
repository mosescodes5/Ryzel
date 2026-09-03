-- =========================================================
-- MIGRATION 0004 — rate limiting for user-triggered endpoints that cost
-- money or hit a paid third-party API (wallet top-up, number purchase,
-- SMS-code checks). Additive only.
-- =========================================================

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- No public policies — only ever touched via the service-role client
-- (through the increment_rate_limit function below), which bypasses RLS.

-- Atomic "increment and read back the new count" — avoids a
-- read-then-write race if two requests land in the same window at once.
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

-- Old windows just sit there (tiny rows) — safe to periodically delete rows
-- older than a day or two from a cron if the table grows large enough to
-- matter; not required for correctness.
