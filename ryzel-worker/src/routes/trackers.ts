import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, desc } from "drizzle-orm";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth, invalidateAuthCache } from "../middleware/auth";
import { withDb, type Db } from "../db/client";
import { shipments, wallets, ledgerEntries } from "../db/schema";
import { getSettings } from "../lib/config";
import { getFeesConfig } from "../lib/fees";

type Vars = { user: CurrentUser };
export const trackerRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
export const publicTrackerRoutes = new Hono<{ Bindings: Env }>();

trackerRoutes.use("*", requireAuth);

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

async function generateUniqueTrackingCode(db: Db): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const existing = await db.query.shipments.findFirst({ where: eq(shipments.trackingCode, code) });
    if (!existing) return code;
  }
  throw new HTTPException(500, { message: "Could not generate a unique tracking code, try again" });
}

function serializeShipment(s: typeof shipments.$inferSelect) {
  return {
    id: s.id,
    tracking_code: s.trackingCode,
    carrier_style: s.carrierStyle,
    carrier_name: s.carrierName,
    sender_name: s.senderName,
    recipient_name: s.recipientName,
    origin: s.origin,
    destination: s.destination,
    package_description: s.packageDescription,
    currency: s.currency,
    language: s.language,
    status: s.status,
    estimated_delivery: s.estimatedDelivery,
    events: s.events,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function serializePublicShipment(s: typeof shipments.$inferSelect) {
  // Explicitly allow-listed fields only — mirrors TrackerPublicRead in
  // schemas.py exactly. Deliberately no id/user_id/sender_name/recipient_name.
  return {
    tracking_code: s.trackingCode,
    carrier_style: s.carrierStyle,
    carrier_name: s.carrierName,
    origin: s.origin,
    destination: s.destination,
    package_description: s.packageDescription,
    language: s.language,
    status: s.status,
    estimated_delivery: s.estimatedDelivery,
    events: s.events,
    updated_at: s.updatedAt,
  };
}

trackerRoutes.get("/", async (c) => {
  const user = c.get("user");

  return withDb(c, async (db) => {
    const rows = await db.query.shipments.findMany({
      where: eq(shipments.userId, user.id),
      orderBy: [desc(shipments.createdAt)],
    });
    return c.json(rows.map(serializeShipment));
  });
});

trackerRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));

  return withDb(c, async (db) => {
    const s = await db.query.shipments.findFirst({ where: eq(shipments.id, id) });
    if (!s || s.userId !== user.id) throw new HTTPException(404, { message: "Tracker not found" });
    return c.json(serializeShipment(s));
  });
});

trackerRoutes.post("/", async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const body = await c.req.json<{
    carrier_style?: string;
    carrier_name?: string | null;
    sender_name?: string | null;
    recipient_name?: string | null;
    origin?: string | null;
    destination: string;
    package_description?: string | null;
    estimated_delivery?: string | null;
    currency?: string;
    language?: string;
  }>();

  if (!body.destination?.trim()) {
    throw new HTTPException(400, { message: "Destination is required" });
  }

  return withDb(c, async (db) => {
    const fees = await getFeesConfig(db, settings);
    const fee = fees.trackerFeeNgn;

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id));
    if (!wallet) throw new HTTPException(500, { message: "Wallet not found" });
    if (wallet.walletBalanceNgn < fee) {
      throw new HTTPException(402, {
        message: `Insufficient wallet balance — creating a tracking link costs \u20a6${fee.toFixed(0)}`,
      });
    }

    const newBalance = wallet.walletBalanceNgn - fee;
    const trackingCode = await generateUniqueTrackingCode(db);
    const now = new Date();

    const [created] = await db
      .insert(shipments)
      .values({
        userId: user.id,
        trackingCode,
        carrierStyle: body.carrier_style ?? "generic",
        carrierName: body.carrier_name ?? null,
        senderName: body.sender_name ?? null,
        recipientName: body.recipient_name ?? null,
        origin: body.origin ?? null,
        destination: body.destination.trim(),
        packageDescription: body.package_description ?? null,
        currency: body.currency ?? "NGN",
        language: body.language ?? "en",
        estimatedDelivery: body.estimated_delivery ? new Date(body.estimated_delivery) : null,
        events: [
          {
            status: "label_created",
            location: body.origin ?? null,
            note: "Tracking created",
            timestamp: now.toISOString(),
          },
        ],
      })
      .returning();

    await db.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, user.id));
    await db.insert(ledgerEntries).values({
      userId: user.id,
      amountNgn: -fee,
      reason: "tracker_fee",
      balanceAfterNgn: newBalance,
    });

    invalidateAuthCache(user.id);

    return c.json(serializeShipment(created));
  });
});

trackerRoutes.post("/:id/events", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const { status, location, note } = await c.req.json<{
    status: string;
    location?: string | null;
    note?: string | null;
  }>();

  return withDb(c, async (db) => {
    const s = await db.query.shipments.findFirst({ where: eq(shipments.id, id) });
    if (!s || s.userId !== user.id) throw new HTTPException(404, { message: "Tracker not found" });

    const now = new Date();
    const events = [
      ...((s.events as any[]) ?? []),
      { status, location: location ?? null, note: note ?? null, timestamp: now.toISOString() },
    ];

    const [updated] = await db
      .update(shipments)
      .set({ events, status, updatedAt: now })
      .where(eq(shipments.id, id))
      .returning();

    return c.json(serializeShipment(updated));
  });
});

trackerRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));

  return withDb(c, async (db) => {
    const s = await db.query.shipments.findFirst({ where: eq(shipments.id, id) });
    if (!s || s.userId !== user.id) throw new HTTPException(404, { message: "Tracker not found" });

    await db.delete(shipments).where(eq(shipments.id, id));
    return c.json({ deleted: true });
  });
});

// Unauthenticated on purpose — this is the shareable link.
publicTrackerRoutes.get("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();

  return withDb(c, async (db) => {
    const s = await db.query.shipments.findFirst({ where: eq(shipments.trackingCode, code) });
    if (!s) throw new HTTPException(404, { message: "Tracking code not found" });
    return c.json(serializePublicShipment(s));
  });
});