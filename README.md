# RYZEL

A virtual-number marketplace built as the first product on a modular, multi-service platform.
Numbers is the MVP; the architecture is set up so invoices, receipts, delivery tracking, and
travel documents can be added later as independent modules without touching the core app.

## Stack

- Next.js 14 (App Router, TypeScript)
- Supabase (Postgres, Auth, Row Level Security)
- Tailwind CSS

## Fixing "Could not find the table 'public.services'"

This means the database schema was never run against the Supabase project your `.env.local`
points at — Postgres genuinely has no `services` table yet, so PostgREST can't query it. Fix:
open your Supabase project's SQL editor and run, in order:

1. `supabase/schema.sql`
2. `supabase/migrations/0002_5sim_pricing_notifications.sql`
3. `supabase/migrations/0003_number_orders_expiry.sql`
4. `supabase/migrations/0004_rate_limits.sql`
5. `supabase/migrations/0005_fix_profiles_rls_recursion.sql`

All three are additive (`create table if not exists`, `on conflict do nothing`) — safe even
though your project already has users and other tables (e.g. `invoices`) in it. Restart `npm run
dev` afterward.

## Using your hosting platform's env var names

If you set up "Runtime variables and secrets" on a hosting platform before wiring this codebase
in, your names likely don't match `.env.example` exactly. The code accepts both — first name
found wins — but three things are **not optional** and were missing from what you listed:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Next.js inlines these into the
  browser bundle at build time, and only works with this *exact* name (no `SUPABASE_URL` fallback
  possible client-side, unlike server code). Add both even if you already have a plain
  `SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` — separate from the anon key, needed for every admin action, wallet
  debit/credit, and the Korapay/poller webhooks. Get it from Supabase → Project Settings → API.

Everything else you listed maps like this:

| Your var | Used as |
|---|---|
| `PROVIDER=fivesim` | Selects the 5sim provider (also accepts `5sim`) |
| `PROVIDER_API_KEY` | 5sim API key |
| `PROVIDER_BASE_URL` | 5sim API base URL |
| `PROVIDER_FALLBACK` | Reserved — no second provider is wired up yet |
| `USD_NGN_RATE` | Converts 5sim's price field to NGN kobo — **verify this against a real 5sim invoice**, some accounts price in RUB, not USD |
| `BREVO_SENDER_NAME` | Brevo SMS sender ID |
| `BREVO_SENDER_EMAIL` | Not used yet — reserved for a future email module |
| `KORAPAY_REDIRECT_URL` | Where Korapay sends customers back; `/wallet/topup/complete` handles it |
| `ADMIN_EMAILS` | Auto-promotes matching emails to admin on next page load |
| `CORS_ORIGINS` | Allowed cross-origin callers of `/api/*` |
| `ORDER_TIMEOUT_SECONDS` | Fallback expiry when 5sim's response omits one |
| `MARKUP_PERCENT` / `MARKUP_FLAT_NGN` / `MIN_PRICE_NGN` | One-time seed for `number_pricing` — after that, edit from `/admin/pricing`, not env vars |
| `INVOICE_FEE_NGN` / `TRACKER_FEE_NGN` | Reserved — those modules aren't built yet |
| `SUPABASE_JWT_SECRET` | Not used by this app (supabase-js doesn't need it) |
| `ENVIRONMENT` | Informational only |

## Getting started

1. Install dependencies:
   ```
   npm install
   ```
2. Create a Supabase project, then copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `KORAPAY_SECRET_KEY` / `KORAPAY_PUBLIC_KEY` — wallet top-ups
   - `FIVESIM_API_KEY` — buys the actual numbers (5sim.net)
   - `FIVESIM_RATE_TO_WALLET_MINOR_UNITS` — see the note in `.env.example`; get this wrong and
     your costs (and therefore profit numbers) will be wrong even though purchases still work
   - `BREVO_API_KEY` / `BREVO_SMS_SENDER` — "your number got a code" SMS alerts
3. Run the schema against your Supabase project:
   - **Brand new project:** run `supabase/schema.sql` in full (SQL editor, or `supabase db push`).
   - **Existing project with users already in it:** run `supabase/schema.sql` normally — every
     statement in it is `create table if not exists` / `insert ... on conflict do nothing`, so it
     won't touch your existing rows — **then** run every file in `supabase/migrations/` in order
     (`0002` through `0009`), which add the columns/tables this update introduces (5sim order
     fields, `number_pricing`, `notify_phone_number`, `expires_at`, `rate_limits`, per-service
     pricing overrides in `0007`, package tracking in `0008`, invoices in `0009`) and fix a
     recursive-RLS bug in the admin policies (`0005`), without dropping or rewriting anything, and
     backfill a `profiles` row for any existing auth user who doesn't have one yet.
   This seeds the `services`/`feature_flags` catalog and the `number_pricing` markup row (45%
   markup by default, matching `MARKUP_PERCENT` — adjust it from `/admin/pricing`).
4. Regenerate typed DB bindings once the project exists (optional but recommended):
   ```
   npm run db:types
   ```
5. Seed a few numbers into `number_inventory` (the marketplace UI reads from there — the mock
   provider in `modules/numbers/providers` is for search/demo, not what populates the DB catalog).
6. `npm run dev` and visit `localhost:3000`.
7. To use the admin dashboard: add your email to `ADMIN_EMAILS` and it'll auto-promote on your
   next page load, or manually set `role = 'admin'` on your row in `profiles` if you'd rather not
   use that env var.

## Package tracker (track.ryzel.online)

A separate, small product from the SMS/number marketplace, deliberately not wired into it:
- **Admin** (`/dashboard/admin/packages`) creates a package (customer, route, description), which
  generates a random tracking number like `RYZ-7K4Q-9MXP`, and adds status updates by hand — there's
  no courier API integration. Every update appends to that package's timeline.
- **Public lookup** at `track.ryzel.online` needs no login — anyone with the tracking number can see
  the status and full timeline, the same trust model as any real courier's tracking page (the
  random tracking number is what limits access, not a login wall).
- Same Next.js deployment as the main site. `middleware.ts` rewrites requests where the `Host`
  header starts with `track.` so `/` on that hostname serves `/track` instead of the main
  marketing page — you don't need a second Cloudflare Pages project. In Cloudflare, add
  `track.ryzel.online` as a **custom domain** on the same Pages project as `ryzel.online`.
- `/track/[trackingNumber]` also works directly on `ryzel.online/track/...` — the rewrite is just a
  convenience for the short public-facing subdomain link.

## Invoice generator

A simple, self-serve invoicing tool at `/dashboard/invoices` — any logged-in user can create one for
their own customers (unlike the package tracker, which is admin-only). Creating an invoice picks the
next sequential number for that user (`INV-0001`, `INV-0002`, ...), and the detail page
(`/dashboard/invoices/[id]`) is a clean, printable layout — the "Print / Save as PDF" button uses the
browser's native print dialog rather than a server-side PDF library, so there's nothing extra to
install or maintain.

## Deploying to Cloudflare Pages

The whole app runs on Cloudflare's Workers runtime via `@cloudflare/next-on-pages` — every
page/route already has `export const runtime = 'edge'` set (inherited from the root layout for
pages; set individually on each `route.ts` since Route Handlers don't inherit from layouts).

**Dependency versions here are pinned on purpose, don't `npm update` them blindly:**
- `next` is pinned to `14.2.35` (latest patched 14.x — 14.2.13 has a known CVE). Cloudflare's
  original adapter, `@cloudflare/next-on-pages`, is being deprecated in favor of
  [OpenNext](https://opennext.js.org/cloudflare) — but OpenNext requires Next 15+, which is a
  bigger jump (Next 15 makes `cookies()`/`headers()`/route `params` async) than this project
  needed for now. Worth migrating to Next 15 + OpenNext later since Cloudflare will eventually
  stop supporting next-on-pages, but that's a deliberate future upgrade, not something to do by
  accident via a routine `npm update`.
- `@cloudflare/next-on-pages` is pinned to `1.13.15`, not the latest `1.13.16` — `1.13.16` added a
  peer requirement of `next >=14.3.0`, a version that was never actually released (Next jumped
  straight from `14.2.x` to `15.0.0`), so no stable Next 14 install can satisfy it.
- `wrangler` is pinned to `4.107.0` and `@cloudflare/workers-types` to the matching `4.x` line —
  newer wrangler versions moved to `@cloudflare/workers-types@^5`, which conflicts with what
  `next-on-pages@1.13.15` expects.
- Because of the above, installs need `--legacy-peer-deps`, e.g. `npm install --legacy-peer-deps`.

**One-time setup:**
1. `npm install --legacy-peer-deps`
2. `npx wrangler login`
3. Update `wrangler.toml`'s `name` if you want a different project name.
4. Set secrets (never put these in `wrangler.toml` or commit them):
   ```
   npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler pages secret put KORAPAY_SECRET_KEY
   npx wrangler pages secret put PROVIDER_API_KEY
   npx wrangler pages secret put BREVO_API_KEY
   npx wrangler pages secret put CRON_SECRET
   ```
   Non-secret vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, etc.) can go in the
   Cloudflare dashboard under Pages → your project → Settings → Environment variables, or in the
   `[vars]` block in `wrangler.toml`. Remember `NEXT_PUBLIC_*` values are baked in at build time —
   changing them requires a rebuild, not just a redeploy.

**Every deploy after that:**
```
npm run deploy
```
This runs `next build` → `@cloudflare/next-on-pages` (converts the build into Cloudflare's Pages
Functions format) → `wrangler pages deploy`.

To preview locally against the Workers runtime (closer to production than plain `next dev`):
```
npm run preview
```

## Wallet top-ups (Korapay)

Users add funds from `/dashboard/wallet`, which POSTs to `/api/v1/wallet/topup`. That route
creates a `pending` row in `payments`, calls Korapay's charge-initialize endpoint, and redirects
the customer to the returned `checkout_url`.

Two things confirm a payment before the wallet is credited:

1. **Webhook** — `/api/v1/wallet/webhook` receives Korapay's `charge.success` event, verifies the
   `x-korapay-signature` header (HMAC-SHA256 of the `data` object, signed with your secret key),
   re-verifies the charge server-to-server, then credits the wallet via `lib/payments/wallet.ts`.
   In your Korapay dashboard, set the webhook URL to `https://<your-domain>/api/v1/wallet/webhook`.
2. **Redirect fallback** — `/api/v1/wallet/verify` runs the same verify-then-credit logic when the
   customer lands back on `/dashboard/wallet` after checkout, so the balance updates immediately
   even if the webhook is delayed. Both paths are idempotent (keyed off `payments.status`), so
   whichever fires first wins and the second is a no-op.

The credited amount always comes from the `payments` row created at top-up time — never from the
webhook payload or the redirect query string — so a tampered redirect URL can't inflate a balance.

Swapping or adding a gateway later means implementing `PaymentProvider`
(`lib/payments/providers/payment-provider.ts`) and adding one case to
`lib/payments/providers/provider-manager.ts`, the same pattern used for number providers.

## Virtual numbers (5sim) + pricing + profit

The marketplace at `/marketplace/numbers` shows **live** prices pulled from 5sim for whichever
country the customer picks — nothing is pre-seeded in the database for this path (the old
`number_inventory` table is still there for a future pre-provisioned/rental-style provider, but
5sim is priced and provisioned on demand).

Flow:

1. `getProductCatalog(country)` (`lib/pricing` + `modules/numbers/services/activation-service.ts`)
   fetches 5sim's live cost per service and applies your markup — that marked-up price is all the
   customer ever sees.
2. On purchase, the wallet is debited at the quoted price, then 5sim is charged. If 5sim's
   purchase fails, the wallet debit is automatically reversed.
3. Each `number_orders` row stores both `price_cents` (charged to the customer) and `cost_cents`
   (5sim's actual charge) — `/admin/orders` sums these into revenue/cost/profit, and `/admin`
   shows the running total.
4. From `/dashboard/orders`, the customer clicks "Check for code" to poll 5sim (5sim doesn't push
   to us — there's no webhook to receive here). When a code arrives, it's saved to `sms_messages`
   and, if the customer has set a notification number on `/dashboard/account`, a Brevo SMS goes
   out immediately.
5. Cancelling an order before a code arrives refunds the customer's wallet in full.
6. A background poller checks every pending order automatically (see "Automatic code polling"
   below) — the manual "Check for code" button still works too, e.g. for an immediate check
   right after purchase.

**Set your margin** at `/admin/pricing` — percent-on-cost or flat-fee-on-cost, plus a price floor.
Changes only affect new purchases; past orders keep the price/cost/profit they were sold at.

## Automatic code polling

5sim has no webhook for incoming SMS — the only way to know a code arrived is to ask. `/api/cron/poll-numbers`
checks every order still awaiting a code, records any newly-arrived one, and fires the Brevo
alert, all without a customer needing to click anything. It's protected by a shared secret
(`CRON_SECRET`) since it has no user session — set that env var to a random 16+ character string.

How you trigger it depends on your Vercel plan:

- **Vercel Pro or higher:** change `vercel.json`'s schedule to `* * * * *` (every minute — Vercel's
  cron doesn't support sub-minute schedules, so once a minute is the practical floor there).
  Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on every invocation.
- **Vercel Hobby:** Vercel's own cron only allows once-per-day schedules on Hobby, which is too
  slow for "the customer is waiting on a code right now." Use a free external scheduler instead —
  cron-job.org, GitHub Actions on a schedule, EasyCron, etc. — pointed at
  `https://<your-domain>/api/cron/poll-numbers` with header `Authorization: Bearer <CRON_SECRET>`,
  running every 15–30 seconds. This works on any plan, including Hobby, since it's just an
  authenticated HTTP request from outside Vercel.
- **Not deployed yet / testing locally:** call it manually —
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/poll-numbers`.

The poller processes up to 50 pending orders per invocation (tune `batchSize` in
`pollAllPendingOrders`) and expires anything past its provider expiry without spending an extra
provider call on it.



- **`src/app`** — routes only. Pages stay thin: fetch via a module/lib function, render.
- **`src/modules/<product>`** — one folder per product (`numbers`, `sms` today). Each owns its
  types, business logic (`services/`), and any provider abstraction it needs. A product's code
  never reaches into another product's tables directly.
- **`src/lib`** — shared platform infrastructure every module can use: Supabase clients, the
  service registry, feature flags, the wallet/ledger, and permissions.
- **`supabase/schema.sql`** — shared tables (`profiles`, `transactions`, `payments`, `services`,
  `feature_flags`, `audit_logs`) plus one small table set per product. No single giant table.

## Email verification & password reset

Both go through Supabase Auth's built-in flows — no separate email-sending service needed for
these (Supabase sends them using its own default templates unless you've customized them in your
project).

- **Signup confirmation:** if your Supabase project has "Confirm email" turned on (Authentication
  → Providers → Email), `signUp()` returns a user with no session until they click the link in
  their inbox. The signup page detects this (`!data.session`) and shows a "check your email" state
  instead of bouncing them into a dashboard they're not authenticated for yet. `/login` also
  detects a "not confirmed" sign-in attempt and offers to resend the email.
- **Password reset:** `/forgot-password` calls `resetPasswordForEmail()`, which emails a recovery
  link. `/reset-password` is where the person sets a new password, using the session that link
  established.
- **`/auth/callback`** is the shared landing point for every Supabase auth email (confirmation,
  recovery, magic link) — it exchanges the one-time `code` in the URL for an actual session
  (`exchangeCodeForSession`), then redirects to wherever `next` says (`/dashboard` for
  confirmation, `/reset-password` for recovery).

**Required Supabase dashboard step:** under Authentication → URL Configuration, add
`{your-app-url}/auth/callback` to the Redirect URLs allow-list (e.g. both
`http://localhost:3000/auth/callback` for local dev and `https://ryzel.online/auth/callback` for
production) — Supabase rejects redirects to URLs not on that list, so the emailed links will
otherwise fail silently. If "Confirm email" is off, signup just logs the person straight in and
none of the confirmation-email code paths trigger — nothing breaks either way, since that setting
is what decides whether `data.session` comes back null.

## Rate limiting & input validation

Previously flagged as a gap — now addressed for the endpoints that cost money or hit a paid
third-party API:

- **Validation** (`lib/validation/schemas.ts`, zod): wallet top-up, number purchase, the inbound
  SMS webhook, and the notify-phone form all reject malformed input with a clear 400 instead of
  either crashing or silently doing the wrong thing.
- **Rate limiting** (`lib/rate-limit/rate-limit.ts`, backed by the new `rate_limits` table —
  migration `0004_rate_limits.sql`): wallet top-up (5 per 10 min), number purchase (10 per 5 min),
  and manual code-checks (20 per min) are capped per user. No extra infra required — it's a fixed
  window counter in Supabase, not Redis, which is plenty for "stop a runaway script," not meant to
  hold up under serious load.

**Not covered, and worth knowing:** signup/login go straight from the browser to Supabase Auth via
`supabase-js` — they never pass through one of our own API routes, so this rate limiter can't see
them. Supabase Auth has its own built-in abuse protection, but if you want RYZEL-specific signup
throttling (e.g. by IP), that requires moving signup through a server route first, which isn't
done here.

## Adding a future product (e.g. the invoice generator)

1. Add a row to `services` (`slug: invoice-generator`, `type: tool`, `active: false`) and a
   `invoice_generator_enabled` row in `feature_flags` — both already exist in the seed data as
   placeholders.
2. Create `src/modules/invoices/` with its own `types.ts`, `services/`, and any provider needed
   (e.g. a PDF renderer, following the same interface pattern as `modules/numbers/providers`).
3. Add product-specific tables (`invoices`, `invoice_items`) to a new migration — don't extend the
   numbers tables or the shared tables.
4. Add routes under `src/app/tools/invoices/` and API routes under `src/app/api/v1/invoices/`.
   They call into `modules/invoices/services`, the same way `marketplace/numbers` calls into
   `modules/numbers/services`.
5. Flip `active: true` on the service and `enabled: true` on the flag from `/admin/services` (or
   directly in the DB) when it's ready for traffic — no core app redeploy needed for that step.

## What's built vs. what's scaffolded

Built and working end-to-end: auth (sign up / sign in, email confirmation, password reset, with
auto-created profile rows via a DB trigger), wallet balance, wallet top-ups via Korapay (checkout
redirect + webhook + redirect-fallback verification), live virtual-number marketplace backed by
5sim (real-time pricing, purchase, code polling, cancel-with-refund), admin-adjustable markup with
a real-time profit dashboard, Brevo SMS alerts when a code arrives, orders dashboard, and an admin
panel to manage services, pricing, and view per-order profit.

Scaffolded but intentionally not implemented (per the architecture doc's priority order):
invoice/receipt/tracking/itinerary modules, document-generation engine, Supabase Storage policies
for generated documents. Each has a clear extension point above rather than a stub UI, so they
don't ship half-built to users.

Known gaps worth knowing about:
- 5sim has no outbound webhook for incoming SMS, so code delivery is pull-based — either the
  customer clicks "Check for code," or the background poller (see below) does it for them. This
  is a constraint of 5sim's API, not a shortcut taken here.
- Signup/login aren't rate-limited by this app (see "Rate limiting & input validation" below) —
  they go straight to Supabase Auth, which has its own protections, but not RYZEL-specific ones.

## Honesty notes baked into the architecture

Per the source doc: any future tracking-number generator or flight-itinerary generator must be
clearly labeled as demo/generated content and never implied to be a real carrier shipment or an
authentic airline booking. Keep that labeling in the UI copy when those modules are built, not
just in the data model.
