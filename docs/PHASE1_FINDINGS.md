# Ryzel: 5SIM integration findings (from https://5sim.net/docs)

## Things in the docs that change the design
1. **Plain-text errors, sometimes on HTTP 200.** Buy returns `200 "no free phones"` (not JSON) and 400s are bare text. The client classifies text into codes; unknown text on a buy => *uncertain*.
2. **Activation SMS objects have no `id`.** Only hosting SMS do. Dedupe uses `smsFingerprint()` => `UNIQUE(provider_order_id, fingerprint)`.
3. **Status label is ambiguous.** Docs say RECEIVED = "waiting of receipt of SMS" yet the example shows RECEIVED *with* an SMS. Logic keys off the `sms` array.
4. **Buy has no idempotency key and 503 doubles as the buy rate-limit code.** All 5xx on buy => `uncertain` (reconcile, never re-buy). Cost: bursts may create extra reconciliation items.
5. **`/user/ban` vs `/user/bn`.** The docs contradict themselves; ban also lists "order has sms" as an error. `canBan` is disabled until verified with a real test order.
6. **Prices have no stated currency** ("cost: float, two decimals"). `PricingSettings.providerCurrency` + `fxRate` are admin-configured; confirm what your account balance is denominated in before going live.
7. **Price-list nesting differs by filter**: country-first normally, product-first for `?product=`. Handled.
8. **`maxPrice` works only with `operator=any`.** For specific operators, re-fetch the live price before reserving funds and compare the buy response `price` to the expected cost; log any drift.
9. **Rating system punishes cancels/timeouts** (-0.1 / -0.15 each; rating 0 => 24h ordering block). Heavy customer cancel/timeout rates can lock the *reseller account*. Consider cancel throttling per user and an admin alert on rating.
10. **Limits:** 100 rps per IP/key (429), 100 rps buy (503), 5 limit hits in 10 min => 10 min ban. Polling must be batched/spread.
11. **Refund semantics are not documented.** Cancel returns status CANCELED but the docs never state a refund. `refundDecision()` refunds Ryzel customers only on confirmed CANCELED/TIMEOUT with zero SMS; verify the upstream balance moves via a small real test.
12. **Operator list requires auth** ("In order to get a list of operators, you need authorization"); use `getCountries()` (public) which lists operators per country.
13. **Order IDs are JSON numbers**: rejected if not safe integers, stored as strings.

## Still required from you (blocked)
- Repo access (or zip) + Supabase schema export (tables, RLS, functions, migrations) -> schema map and additive migrations.
- Which payment provider (Paystack/Flutterwave) is already wired, and the current wallet/ledger tables.
- 5SIM API key (as Supabase secret) + small-value test budget; the 5SIM account's currency.
- Framework / package manager so the modules can be placed and imports adjusted (Deno Edge Functions need explicit `.ts` extensions).
