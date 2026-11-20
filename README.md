# Apply in this order
1. **Now, independent of any deploy:** run `supabase/migrations/0010_security_hotfix.sql` in the Supabase SQL editor. Closes the self-service balance/admin hole. Safe for the current app (only `notify_phone_number` is written from a user session).
2. Run `supabase/migrations/0011_wallet_core.sql`.
3. **Only after step 2:** `git apply ryzel-app-changes.patch` and deploy (the patched app calls the new SQL functions; deploying first would break wallet operations).
4. Run `supabase/diagnostics/live_db_checks.sql` and send me the output.
Rollback notes are at the top of each migration.
