import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { desc, eq, ilike, inArray, sql, count, sum } from "drizzle-orm";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { withDb } from "../db/client";
import { wallets, orders, ledgerEntries, siteSettings } from "../db/schema";
import { getSettings } from "../lib/config";
import { getPricingConfig, savePricingConfig } from "../lib/pricing";
import { getFeesConfig, saveFeesConfig } from "../lib/fees";
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from "./settings";

type Vars = { user: CurrentUser };
export const adminRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

adminRoutes.use("*", requireAuth, requireAdmin);

function serializeUser(w: typeof wallets.$inferSelect) {
  return {
    user_id: w.userId,
    email: w.email,
    wallet_balance_ngn: w.walletBalanceNgn,
    is_admin: w.isAdmin,
    is_suspended: w.isSuspended,
    created_at: w.createdAt,
  };
}

function serializeOrder(o: typeof orders.$inferSelect, userEmail: string | null) {
  return {
    id: o.id,
    service: o.service,
    country: o.country,
    provider_name: o.providerName,
    phone_number: o.phoneNumber,
    price_ngn: o.priceNgn,
    status: o.status,
    sms_code: o.smsCode,
    created_at: o.createdAt,
    expires_at: o.expiresAt,
    completed_at: o.completedAt,
    user_id: o.userId,
    user_email: userEmail,
  };
}

// ---------- Site settings ----------

adminRoutes.get("/settings", async (c) => {
  return withDb(c, async (db) => c.json(await getSiteSettings(db)));
});

adminRoutes.put("/settings", async (c) => {
  const body = await c.req.json<Record<string, string>>();

  return withDb(c, async (db) => {
    for (const key of Object.keys(SITE_SETTINGS_DEFAULTS)) {
      const value = body[key] ?? "";
      await db
        .insert(siteSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
    }

    return c.json(await getSiteSettings(db));
  });
});

// ---------- Pricing (markup knobs) ----------

adminRoutes.get("/pricing", async (c) => {
  const settings = getSettings(c.env);

  return withDb(c, async (db) => {
    const cfg = await getPricingConfig(db, settings);
    return c.json({
      usd_ngn_rate: cfg.usdNgnRate,
      min_price_ngn: cfg.minPriceNgn,
      tiers: cfg.tiers.map((t) => ({
        max_cost_ngn: t.maxCostNgn,
        markup_percent: t.markupPercent,
        markup_flat_ngn: t.markupFlatNgn,
      })),
    });
  });
});

adminRoutes.put("/pricing", async (c) => {
  const settings = getSettings(c.env);
  const body = await c.req.json<{
    usd_ngn_rate: number;
    min_price_ngn: number;
    tiers: Array<{ max_cost_ngn: number | null; markup_percent: number; markup_flat_ngn: number }>;
  }>();

  if (!body.tiers || body.tiers.length === 0) {
    throw new HTTPException(400, { message: "At least one pricing tier is required." });
  }

  return withDb(c, async (db) => {
    await savePricingConfig(
      db,
      body.usd_ngn_rate,
      body.min_price_ngn,
      body.tiers.map((t) => ({ maxCostNgn: t.max_cost_ngn, markupPercent: t.markup_percent, markupFlatNgn: t.markup_flat_ngn })),
      settings
    );

    const cfg = await getPricingConfig(db, settings);
    return c.json({
      usd_ngn_rate: cfg.usdNgnRate,
      min_price_ngn: cfg.minPriceNgn,
      tiers: cfg.tiers.map((t) => ({
        max_cost_ngn: t.maxCostNgn,
        markup_percent: t.markupPercent,
        markup_flat_ngn: t.markupFlatNgn,
      })),
    });
  });
});

// ---------- Fees (invoice & tracker creation cost) ----------

adminRoutes.get("/fees", async (c) => {
  const settings = getSettings(c.env);

  return withDb(c, async (db) => {
    const fees = await getFeesConfig(db, settings);
    return c.json({ invoice_fee_ngn: fees.invoiceFeeNgn, tracker_fee_ngn: fees.trackerFeeNgn });
  });
});

adminRoutes.put("/fees", async (c) => {
  const settings = getSettings(c.env);
  const body = await c.req.json<{ invoice_fee_ngn: number; tracker_fee_ngn: number }>();

  if (typeof body.invoice_fee_ngn !== "number" || body.invoice_fee_ngn < 0) {
    throw new HTTPException(400, { message: "invoice_fee_ngn must be a non-negative number" });
  }
  if (typeof body.tracker_fee_ngn !== "number" || body.tracker_fee_ngn < 0) {
    throw new HTTPException(400, { message: "tracker_fee_ngn must be a non-negative number" });
  }

  return withDb(c, async (db) => {
    await saveFeesConfig(db, body.invoice_fee_ngn, body.tracker_fee_ngn);
    const fees = await getFeesConfig(db, settings);
    return c.json({ invoice_fee_ngn: fees.invoiceFeeNgn, tracker_fee_ngn: fees.trackerFeeNgn });
  });
});

// ---------- Users ----------

adminRoutes.get("/users", async (c) => {
  const q = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  return withDb(c, async (db) => {
    const rows = await db
      .select()
      .from(wallets)
      .where(q ? ilike(wallets.email, `%${q}%`) : undefined)
      .orderBy(desc(wallets.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json(rows.map(serializeUser));
  });
});

adminRoutes.post("/users/:userId/adjust-wallet", async (c) => {
  const userId = c.req.param("userId");
  const { amount_ngn, reason } = await c.req.json<{ amount_ngn: number; reason?: string }>();

  return withDb(c, async (db) => {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) throw new HTTPException(404, { message: "User not found" });

    const newBalance = wallet.walletBalanceNgn + amount_ngn;
    const [updated] = await db
      .update(wallets)
      .set({ walletBalanceNgn: newBalance })
      .where(eq(wallets.userId, userId))
      .returning();

    await db.insert(ledgerEntries).values({
      userId,
      amountNgn: amount_ngn,
      reason: reason ? `admin_adjust: ${reason}` : "admin_adjust",
      balanceAfterNgn: newBalance,
    });

    return c.json(serializeUser(updated));
  });
});

adminRoutes.post("/users/:userId/suspend", async (c) => {
  const userId = c.req.param("userId");

  return withDb(c, async (db) => {
    const [updated] = await db.update(wallets).set({ isSuspended: true }).where(eq(wallets.userId, userId)).returning();
    if (!updated) throw new HTTPException(404, { message: "User not found" });
    return c.json(serializeUser(updated));
  });
});

adminRoutes.post("/users/:userId/unsuspend", async (c) => {
  const userId = c.req.param("userId");

  return withDb(c, async (db) => {
    const [updated] = await db
      .update(wallets)
      .set({ isSuspended: false })
      .where(eq(wallets.userId, userId))
      .returning();
    if (!updated) throw new HTTPException(404, { message: "User not found" });
    return c.json(serializeUser(updated));
  });
});

adminRoutes.post("/users/:userId/toggle-admin", async (c) => {
  const admin = c.get("user");
  const userId = c.req.param("userId");

  if (userId === admin.id) {
    throw new HTTPException(400, { message: "You can't change your own admin status here." });
  }

  return withDb(c, async (db) => {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) throw new HTTPException(404, { message: "User not found" });

    const [updated] = await db
      .update(wallets)
      .set({ isAdmin: !wallet.isAdmin })
      .where(eq(wallets.userId, userId))
      .returning();

    return c.json(serializeUser(updated));
  });
});

// ---------- Orders (all users) ----------

adminRoutes.get("/orders", async (c) => {
  const statusFilter = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  return withDb(c, async (db) => {
    const rows = await db
      .select()
      .from(orders)
      .where(statusFilter ? eq(orders.status, statusFilter) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(rows.map((o) => o.userId))];
    const emailsByUser = new Map<string, string | null>();
    if (userIds.length > 0) {
      const userRows = await db.select().from(wallets).where(inArray(wallets.userId, userIds));
      for (const w of userRows) emailsByUser.set(w.userId, w.email);
    }

    return c.json(rows.map((o) => serializeOrder(o, emailsByUser.get(o.userId) ?? null)));
  });
});

// ---------- Stats ----------

adminRoutes.get("/stats", async (c) => {
  const settings = getSettings(c.env);

  return withDb(c, async (db) => {
    const [{ value: totalUsers }] = await db.select({ value: count() }).from(wallets);
    const [{ value: totalOrders }] = await db.select({ value: count() }).from(orders);
    const [{ value: ordersPending }] = await db.select({ value: count() }).from(orders).where(eq(orders.status, "pending"));
    const [{ value: ordersReceived }] = await db.select({ value: count() }).from(orders).where(eq(orders.status, "received"));
    const [{ value: totalWalletBalance }] = await db
      .select({ value: sql<number>`coalesce(sum(${wallets.walletBalanceNgn}), 0)`.mapWith(Number) })
      .from(wallets);

    const [{ value: revenue }] = await db
      .select({ value: sql<number>`coalesce(sum(${ledgerEntries.amountNgn}), 0)`.mapWith(Number) })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.reason, "order_charge"));

    const [{ value: topups }] = await db
      .select({ value: sql<number>`coalesce(sum(${ledgerEntries.amountNgn}), 0)`.mapWith(Number) })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.reason, ["topup_korapay", "topup_dev"]));

    // Provider cost is only known in USD per order — convert using the
    // *current* usd_ngn_rate. Approximation for older orders bought at a
    // different rate; good enough for a running profit picture, not exact
    // historical accounting. Only "received" orders count — refunded orders
    // are a wash.
    const [{ value: costUsdTotal }] = await db
      .select({ value: sql<number>`coalesce(sum(${orders.costUsd}), 0)`.mapWith(Number) })
      .from(orders)
      .where(eq(orders.status, "received"));

    const cfg = await getPricingConfig(db, settings);
    const totalProviderCostNgn = costUsdTotal * cfg.usdNgnRate;

    const totalRevenueNgn = Math.abs(revenue); // order_charge entries are stored negative
    const totalProfitNgn = totalRevenueNgn - totalProviderCostNgn;
    const profitMarginPct = totalRevenueNgn ? (totalProfitNgn / totalRevenueNgn) * 100 : 0;

    return c.json({
      total_users: totalUsers,
      total_orders: totalOrders,
      orders_pending: ordersPending,
      orders_received: ordersReceived,
      total_wallet_balance_ngn: totalWalletBalance,
      total_revenue_ngn: totalRevenueNgn,
      total_topups_ngn: topups,
      total_provider_cost_ngn: Math.round(totalProviderCostNgn * 100) / 100,
      total_profit_ngn: Math.round(totalProfitNgn * 100) / 100,
      profit_margin_pct: Math.round(profitMarginPct * 10) / 10,
    });
  });
});