# Phase 4 — safe purchases, background polling, expiry refunds, whole-naira money

## Order lifecycle
purchasing -> awaiting_sms -> received | cancelled | expired | failed   (+ needs_review)

* purchasing    wallet already debited; provider call in flight or outcome unknown. Money is HELD.
* needs_review  ambiguous; a human decides (money stays held). Admin refund tool = next step.
* A refund only ever happens through order_refund() (exactly once), and only when:
  the provider clearly refused the purchase, OR the provider confirms the order is over
  with no code, OR the customer cancelled, OR the provider's history proves it was never bought.

## Go-live order (do not skip steps)
1. Supabase SQL editor: run supabase/migrations/0012_order_state_machine.sql
   (safe to run twice). Then run supabase/diagnostics/test_order_functions.sql
   -> every row must say PASS. It rolls itself back.
2. In your terminal:  supabase migration repair --status applied 0012
   (so the CI pipeline doesn't try to run it again)
3. Confirm your 5sim billing currency, then set FIVESIM_NGN_PER_UNIT in BOTH wrangler.jsonc and
   wrangler.toml (they must match) = naira per 1 unit of 5sim's price. While it is empty,
   selling numbers is paused on purpose.
4. npx wrangler secret put CRON_SECRET   (any long random string)
5. git apply --check ryzel-phase4.patch  then  git apply ryzel-phase4.patch
   npm run lint && npx tsc --noEmit && npm test
6. Push a branch, open a PR, wait for green CI, merge, approve the production deploy.
7. After deploy: Cloudflare dashboard -> Worker -> Logs: look for "cron poll ok" every minute.
8. Make ONE small real purchase and watch it end to end.

## Not verified (could not be tested from here)
* The 5sim order-history response format (client.ts listRecentActivations) is written from
  5sim's docs, not a live call. Until verified, an unreadable history just means "wait" — never a refund.
* The custom Cloudflare worker entry (worker.ts) has not been built against your OpenNext version.
* The SQL functions are verified by test_order_functions.sql on YOUR database, not here.
