import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, desc } from "drizzle-orm";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth, invalidateAuthCache } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { withDb, type Db } from "../db/client";
import { orders, wallets, ledgerEntries } from "../db/schema";
import { getSettings } from "../lib/config";
import { priceForCustomer } from "../lib/pricing";
import { getFallbackChain, getProviderByName } from "../providers";
import { ProviderLookupError } from "../providers/types";
import { orderReceiptEmail, sendEmailSafe } from "../lib/email";

type Vars = { user: CurrentUser };
export const orderRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

orderRoutes.use("*", requireAuth);

function serializeOrder(o: typeof orders.$inferSelect) {
  return {
    id: o.id,
    service: o.service,
    country: o.country,
    provider_name: o.providerName,
    phone_number: o.phoneNumber,
    cost_usd: o.costUsd,
    price_ngn: o.priceNgn,
    status: o.status,
    sms_code: o.smsCode,
    created_at: o.createdAt,
    expires_at: o.expiresAt,
    completed_at: o.completedAt,
  };
}

orderRoutes.get("/", async (c) => {
  const user = c.get("user");

  return withDb(c, async (db) => {
    const rows = await db.query.orders.findMany({
      where: eq(orders.userId, user.id),
      orderBy: [desc(orders.createdAt)],
    });
    return c.json(rows.map(serializeOrder));
  });
});

orderRoutes.get("/price", rateLimit("RATE_LIMIT_ORDERS_PRICE"), async (c) => {
  const settings = getSettings(c.env);
  const service = (c.req.query("service") ?? "").trim().toLowerCase();
  const country = (c.req.query("country") ?? "").trim().toLowerCase();

  if (!service) throw new HTTPException(400, { message: "Service is required" });
  if (!country) throw new HTTPException(400, { message: "Country is required" });

  // Provider lookup happens BEFORE opening a DB connection — this used to
  // sit inside withDb, holding a Postgres connection open for the entire
  // external network round-trip to the SMS provider. Under real traffic
  // that's enough to exhaust Hyperdrive's connection pool, which is what
  // caused the recurring "Timed out while waiting for an open slot"
  // errors (and, very likely, the missed deposit — the payment webhook
  // couldn't get a connection either while this was happening).
  let costUsd: number | null = null;
  let lastError: unknown = null;
  for (const provider of getFallbackChain(settings)) {
    try {
      costUsd = await provider.getPriceUsd(service, country);
      break;
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (costUsd === null) {
    if (lastError instanceof ProviderLookupError) {
      throw new HTTPException(404, { message: lastError.message });
    }
    throw new HTTPException(502, { message: `Provider error: ${String((lastError as Error)?.message ?? lastError)}` });
  }

  return withDb(c, async (db) => {
    return c.json({
      service,
      country,
      cost_usd: costUsd,
      price_ngn: await priceForCustomer(costUsd, db, settings),
    });
  });
});

orderRoutes.post("/", rateLimit("RATE_LIMIT_ORDERS_BUY"), async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const service = (c.req.query("service") ?? "").trim().toLowerCase();
  const country = (c.req.query("country") ?? "").trim().toLowerCase();
  const normalizedOperator = (c.req.query("operator") ?? "any").trim().toLowerCase();

  if (!service) throw new HTTPException(400, { message: "Service is required" });
  if (!country) throw new HTTPException(400, { message: "Country is required" });

  // Reservation happens BEFORE opening a DB connection — same reasoning
  // as /price above. This can take a while (network round-trip to the
  // provider), and previously held a DB connection open the whole time.
  let provider = null;
  let reserved = null;
  let lastError: unknown = null;

  for (const candidate of getFallbackChain(settings)) {
    try {
      reserved = await candidate.reserveNumber(service, country, normalizedOperator);
      provider = candidate;
      break;
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (!reserved || !provider) {
    if (lastError instanceof ProviderLookupError) {
      throw new HTTPException(400, { message: lastError.message });
    }
    throw new HTTPException(502, { message: `Provider error: ${String((lastError as Error)?.message ?? lastError)}` });
  }

  return withDb(c, async (db) => {
    const priceNgn = await priceForCustomer(reserved.costUsd, db, settings);

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
    if (!wallet) throw new HTTPException(500, { message: "Wallet not found" });

    if (wallet.walletBalanceNgn < priceNgn) {
      try {
        await provider.cancelOrder(reserved.providerOrderId);
      } catch {
        // best-effort — the customer still gets a clean 402 either way
      }
      throw new HTTPException(402, { message: "Insufficient wallet balance" });
    }

    const newBalance = wallet.walletBalanceNgn - priceNgn;
    const expiresAt = new Date(Date.now() + settings.orderTimeoutSeconds * 1000);

    const [order] = await db
      .insert(orders)
      .values({
        userId: user.id,
        service,
        country,
        providerName: provider.name,
        providerOrderId: reserved.providerOrderId,
        phoneNumber: reserved.phoneNumber,
        costUsd: reserved.costUsd,
        priceNgn,
        status: "pending",
        expiresAt,
      })
      .returning();

    await db.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, user.id));
    await db.insert(ledgerEntries).values({
      userId: user.id,
      amountNgn: -priceNgn,
      reason: "order_charge",
      orderId: order.id,
      balanceAfterNgn: newBalance,
    });

    invalidateAuthCache(user.id);

    return c.json(serializeOrder(order));
  });
});

orderRoutes.get("/:id", rateLimit("RATE_LIMIT_ORDERS_CHECK"), async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const orderId = Number(c.req.param("id"));

  // This route is polled repeatedly by the frontend while waiting for an
  // SMS code, which made it the worst offender for pool exhaustion: it
  // used to hold a DB connection open for the entire checkSms/cancelOrder
  // network round-trip, on every single poll. Fixed the same way as
  // /price and POST / above — short DB read, external call with no DB
  // connection open, short DB write only if needed.
  const order = await withDb(c, async (db) => {
    const found = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!found || found.userId !== user.id) throw new HTTPException(404, { message: "Order not found" });
    return found;
  });

  if (order.status !== "pending") return c.json(serializeOrder(order));

  const provider = getProviderByName(order.providerName, settings);

  if (new Date() > order.expiresAt) {
    try {
      await provider.cancelOrder(order.providerOrderId);
    } catch {
      // best-effort
    }
    return withDb(c, async (db) => {
      const refunded = await refund(db, order, user.id, "order_refund_timeout", "expired");
      return c.json(serializeOrder(refunded));
    });
  }

  let code: string | null;
  try {
    code = await provider.checkSms(order.providerOrderId);
  } catch (e) {
    throw new HTTPException(502, { message: `Provider error: ${String((e as Error)?.message ?? e)}` });
  }

  if (!code) return c.json(serializeOrder(order));

  return withDb(c, async (db) => {
    const [updated] = await db
      .update(orders)
      .set({ smsCode: code, status: "received", completedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();

    // Best-effort receipt — never fails the order, which has already
    // succeeded and been paid for by this point.
    const { subject, html } = orderReceiptEmail(
      settings,
      updated.service,
      updated.country,
      updated.phoneNumber,
      updated.smsCode!,
      updated.priceNgn
    );
    c.executionCtx.waitUntil(sendEmailSafe(settings, user.email, subject, html));

    return c.json(serializeOrder(updated));
  });
});

orderRoutes.post("/:id/cancel", rateLimit("RATE_LIMIT_ORDERS_CANCEL"), async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const orderId = Number(c.req.param("id"));

  const order = await withDb(c, async (db) => {
    const found = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!found || found.userId !== user.id) throw new HTTPException(404, { message: "Order not found" });
    if (found.status !== "pending") {
      throw new HTTPException(400, { message: `Order already ${found.status}` });
    }
    return found;
  });

  const provider = getProviderByName(order.providerName, settings);
  try {
    await provider.cancelOrder(order.providerOrderId);
  } catch (e) {
    throw new HTTPException(502, { message: `Provider error: ${String((e as Error)?.message ?? e)}` });
  }

  return withDb(c, async (db) => {
    const refunded = await refund(db, order, user.id, "order_refund_cancelled", "cancelled");
    return c.json(serializeOrder(refunded));
  });
});

async function refund(
  db: Db,
  order: typeof orders.$inferSelect,
  userId: string,
  reason: string,
  status: string
) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) throw new Error("Wallet not found during refund");

  const newBalance = wallet.walletBalanceNgn + order.priceNgn;
  const completedAt = new Date();

  const [updatedOrder] = await db
    .update(orders)
    .set({ status, completedAt })
    .where(eq(orders.id, order.id))
    .returning();

  await db.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, userId));
  await db.insert(ledgerEntries).values({
    userId,
    amountNgn: order.priceNgn,
    reason,
    orderId: order.id,
    balanceAfterNgn: newBalance,
  });

  invalidateAuthCache(userId);

  return updatedOrder;
}