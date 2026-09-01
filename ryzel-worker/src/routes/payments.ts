import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { invalidateAuthCache } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { withDb } from "../db/client";
import { pendingPayments, wallets, ledgerEntries } from "../db/schema";
import { getSettings } from "../lib/config";
import { KorapayError, initializeCharge, verifyTransaction, verifyWebhookSignature } from "../lib/korapay";
import { sendEmailSafe, topupReceiptEmail } from "../lib/email";
import { eq, and } from "drizzle-orm";

type Vars = { user: CurrentUser };
export const paymentRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const MIN_TOPUP_NGN = 100;
const MAX_TOPUP_NGN = 500_000; // sanity ceiling; tune to your risk appetite

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

paymentRoutes.post("/initialize", requireAuth, rateLimit("RATE_LIMIT_PAYMENTS_INIT"), async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const amountNgn = Number(c.req.query("amount_ngn"));

  if (!(amountNgn >= MIN_TOPUP_NGN && amountNgn <= MAX_TOPUP_NGN)) {
    throw new HTTPException(400, { message: `Amount must be between ${MIN_TOPUP_NGN} and ${MAX_TOPUP_NGN} NGN` });
  }

  // Korapay caps `reference` at 50 characters — a short user-id fragment
  // plus random hex is plenty unique; the DB row (not the reference
  // string) is what actually links this back to the user.
  const reference = `tp_${user.id.replace(/-/g, "").slice(0, 8)}_${randomHex(8)}`;

  return withDb(c, async (db) => {
    const [payment] = await db
      .insert(pendingPayments)
      .values({ reference, userId: user.id, amountNgn })
      .returning();

    try {
      const charge = await initializeCharge(settings, {
        amountNgn,
        customerEmail: user.email,
        reference,
        redirectUrl: settings.korapayRedirectUrl,
      });
      return c.json({ reference, checkout_url: charge.checkout_url });
    } catch (e) {
      await db.update(pendingPayments).set({ status: "failed" }).where(eq(pendingPayments.id, payment.id));
      // Full detail goes to your Worker logs (`wrangler tail`) even if the
      // frontend only sees a shortened version.
      console.warn(
        `Korapay initialize failed for user=${user.id} amount=${amountNgn} reference=${reference}:`,
        e
      );
      const message = e instanceof KorapayError ? e.message : String((e as Error)?.message ?? e);
      throw new HTTPException(502, { message: `Payment provider error: ${message}` });
    }
  });
});

paymentRoutes.post("/webhook", async (c) => {
  const settings = getSettings(c.env);
  const rawBody = await c.req.text();
  const signature = c.req.header("x-korapay-signature") ?? null;

  if (!(await verifyWebhookSignature(settings, rawBody, signature))) {
    // Don't leak *why* it failed — just refuse it.
    throw new HTTPException(401, { message: "Invalid signature" });
  }

  const payload = JSON.parse(rawBody);
  const reference = payload?.data?.reference;
  if (!reference) throw new HTTPException(400, { message: "Missing reference" });

  return withDb(c, async (db) => {
    const payment = await db.query.pendingPayments.findFirst({ where: eq(pendingPayments.reference, reference) });

    if (!payment) {
      // Unrecognized reference — ignore rather than error. Some gateways
      // retry aggressively; we don't want to leak info via error codes.
      return c.json({ status: "ignored" });
    }

    if (payment.status === "success") {
      // Already credited — webhooks can and will arrive more than once.
      return c.json({ status: "already_processed" });
    }

    // Never trust payload.status directly. Re-verify server-side against Korapay.
    let verified: any;
    try {
      verified = await verifyTransaction(settings, reference);
    } catch {
      throw new HTTPException(502, { message: "Could not verify with provider" });
    }

    if (verified.status !== "success") {
      await db.update(pendingPayments).set({ status: "failed" }).where(eq(pendingPayments.id, payment.id));
      return c.json({ status: "not_successful" });
    }

    const verifiedAmount = Number(verified.amount ?? 0);
    if (verifiedAmount < payment.amountNgn) {
      // Paid less than expected — do not credit the originally requested amount.
      throw new HTTPException(400, { message: "Amount mismatch" });
    }

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, payment.userId));
    if (!wallet) throw new HTTPException(500, { message: "Wallet not found" });

    const newBalance = wallet.walletBalanceNgn + payment.amountNgn;

    await db.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, payment.userId));
    await db
      .update(pendingPayments)
      .set({ status: "success", confirmedAt: new Date() })
      .where(eq(pendingPayments.id, payment.id));
    await db.insert(ledgerEntries).values({
      userId: payment.userId,
      amountNgn: payment.amountNgn,
      reason: "topup_korapay",
      balanceAfterNgn: newBalance,
    });

    // Without this, a request landing within the auth cache's 1.5s window
    // right after this webhook fires could still show the pre-credit
    // balance — exactly the "deposit didn't reflect" symptom we're
    // fixing, not something we want to reintroduce via caching.
    invalidateAuthCache(payment.userId);

    if (wallet.email) {
      const { subject, html } = topupReceiptEmail(settings, payment.amountNgn, newBalance);
      c.executionCtx.waitUntil(sendEmailSafe(settings, wallet.email, subject, html));
    }

    return c.json({ status: "credited" });
  });
});

paymentRoutes.get("/status/:reference", requireAuth, async (c) => {
  const user = c.get("user");
  const reference = c.req.param("reference");
  if (!reference) throw new HTTPException(400, { message: "Reference is required" });

  return withDb(c, async (db) => {
    const payment = await db.query.pendingPayments.findFirst({ where: eq(pendingPayments.reference, reference) });
    if (!payment || payment.userId !== user.id) throw new HTTPException(404, { message: "Payment not found" });

    return c.json({ reference: payment.reference, status: payment.status });
  });
});