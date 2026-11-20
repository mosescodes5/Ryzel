# Ryzel audit (repo `mosescodes5/Ryzel`, main @ 3134c9a) + schema dump + profiles export

## What exists
Next.js 15 (App Router, TypeScript) on Cloudflare Workers via OpenNext; Supabase (Auth, Postgres, RLS);
Korapay for top-ups; 5SIM via a thin provider layer; Brevo for SMS alerts; invoices + package tracking
modules; separate `ryzel-track` Next app. README still describes a FastAPI backend that is no longer in the repo.

## Findings
| # | Sev | Finding | Status |
|---|-----|---------|--------|
| C1 | CRITICAL | `profiles_update_own` has no column restriction -> any logged-in user can set their own `wallet_balance_cents` and `role='admin'` via the public REST API (reproduced). Also: client INSERT on `number_orders`; legacy `wallets` (balance + is_admin) has no RLS in the schema dump. | **Fixed in 0010** (verified) |
| C2 | CRITICAL | `wallet.ts` read-modify-write: concurrent purchases overspend; concurrent credits lose updates (reproduced: 150 wallet paid 200). | **Fixed in 0011** (verified) |
| C3 | CRITICAL | Korapay webhook and redirect-verify both credit the same payment with no lock/unique ledger key -> double credit. Korapay-reported amount/currency never compared to the payment row. | **Fixed in 0011** (verified) |
| H1 | HIGH | Purchase = debit -> buy; ANY provider error (incl. timeout/5xx) refunds. If 5SIM actually issued the number you've lost the cost and the customer can't see it. If the DB insert fails after a successful buy, the buy is orphaned and the customer refunded: the exact "lost activation" failure. | Open: needs reserve/reconcile state machine (Phase 4, `ryzel-core`) |
| H2 | HIGH | Polling cron is `0 0 * * *` (daily) in `vercel.json`, which Cloudflare Workers ignores. OTPs are only fetched when the user clicks "Check". Orders are marked `expired` by local clock without a final provider check. | Open (Phase 5) |
| H3 | HIGH | Unit confusion: columns named `*_cents` hold whole naira (per korapay-provider.ts) but `toWalletCents()` multiplies provider price x USD_NGN_RATE x **100** (kobo scale). Provider currency assumed USD, unverified. Prices could be 100x wrong. | Open: need check #5 in live_db_checks.sql |
| H4 | HIGH | Expired/timed-out orders are never refunded. | Open (Phase 6) |
| M1 | MED | Rate limiter fails open on error; no limit on cancel (hurts your 5SIM rating). | Open |
| M2 | MED | No SMS dedupe table; only latest SMS stored; notify-once relies on racy status check. | Open (Phase 5) |
| M3 | MED | Customers can read `cost_cents` (your provider cost) on their own orders. | Open (needs UI query change) |
| M4 | MED | Three admin authorities: `profiles.role`, `ADMIN_EMAILS` self-promote, legacy `wallets.is_admin`. Two wallet systems (`profiles` vs legacy `wallets`). | Partially mitigated (0010 locks legacy) |
| M5 | LOW | `transactions.currency` / `payments.currency` default `USD`; `ryzel-track/.next` committed; misleading `NUMBERS_PROVIDER=mock` var. | Open |

## Profiles export (58 rows)
One admin row, no balance above 4,000 and 11 non-zero wallets totalling 10,824 units: nothing in this snapshot
looks like past exploitation, but a snapshot can't show history. Run `supabase/diagnostics/live_db_checks.sql`.

## Verification honesty
Migrations were tested on local PostgreSQL 16 with the repo's `schema.sql` + migrations and stubbed Supabase auth
(`auth.uid()`, `anon`/`authenticated`/`service_role`). The live DB may differ (your dump shows legacy tables the repo
schema doesn't contain). Run the diagnostics first. Not tested against live Korapay or live 5SIM.
