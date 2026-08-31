import { Hono } from "hono";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";

type Vars = { user: CurrentUser };
export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

authRoutes.use("*", requireAuth);

/**
 * The frontend calls this to decide whether to show the Admin link/panel
 * (admin/page.js and dashboard/page.js both gate on `is_admin` from this
 * response) — this route didn't exist at all before, which is why it
 * 404'd and admin access silently failed even for a correctly-configured
 * admin email.
 */
authRoutes.get("/me", (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    email: user.email,
    wallet_balance_ngn: user.walletBalanceNgn,
    is_admin: user.isAdmin,
    is_suspended: user.isSuspended,
  });
});