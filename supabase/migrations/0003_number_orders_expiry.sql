-- =========================================================
-- MIGRATION 0003 — expires_at on number_orders, for the background
-- poller (checks pending orders automatically instead of requiring the
-- customer to click "Check for code").
-- Additive only — safe to run on the existing project.
-- =========================================================

alter table public.number_orders
  add column if not exists expires_at timestamptz;

-- Index to make "find everything still awaiting a code" cheap for the poller.
create index if not exists number_orders_awaiting_idx
  on public.number_orders (status, last_checked_at)
  where status = 'awaiting_sms';
