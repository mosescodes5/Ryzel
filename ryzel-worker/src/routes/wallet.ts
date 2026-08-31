import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { desc, eq } from "drizzle-orm";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { withDb } from "../db/client";
import { wallets, ledgerEntries } from "../db/schema";
import { getSettings } from "../lib/config";

type Vars = { user: CurrentUser };
export const walletRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

walletRoutes.use("*", requireAuth);

walletRoutes.get("/balance", (c) => {
  const user = c.get("user");
  return c.json({ wallet_balance_ngn: user.walletBalanceNgn });
});

walletRoutes.get("/ledger", async (c) => {
  const user = c.get("user");

  return withDb(c, async (db) => {
    const entries = await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.userId, user.id),
      orderBy: [desc(ledgerEntries.createdAt)],
    });
    return c.json(
      entries.map((e) => ({
        id: e.id,
        amount_ngn: e.amountNgn,
        reason: e.reason,
        order_id: e.orderId,
        balance_after_ngn: e.balanceAfterNgn,
        created_at: e.createdAt,
      }))
    );
  });
});

/**
 * Local testing ONLY — credits the wallet with no real payment. Gated
 * behind ENVIRONMENT !== "production", same role as Python's
 * `if not settings.debug: 404`. Real top-ups go through
 * POST /payments/korapay/initialize + the webhook.
 */
walletRoutes.post("/topup/dev-only", async (c) => {
  const settings = getSettings(c.env);
  if (settings.environment === "production") {
    throw new HTTPException(404, { message: "Not found" });
  }

  const amountNgn = Number(c.req.query("amount_ngn"));
  if (!amountNgn || amountNgn <= 0) {
    throw new HTTPException(400, { message: "Amount must be positive" });
  }

  const user = c.get("user");

  return withDb(c, async (db) => {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
    if (!wallet) throw new HTTPException(500, { message: "Wallet not found" });

    const newBalance = wallet.walletBalanceNgn + amountNgn;
    await db.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, user.id));
    await db.insert(ledgerEntries).values({
      userId: user.id,
      amountNgn,
      reason: "topup_dev",
      balanceAfterNgn: newBalance,
    });

    return c.json({ wallet_balance_ngn: newBalance });
  });
});