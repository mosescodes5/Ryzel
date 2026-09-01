import { Hono } from "hono";
import type { Env } from "../types";
import { withDb, type Db } from "../db/client";
import { siteSettings } from "../db/schema";

export const SITE_SETTINGS_DEFAULTS: Record<string, string> = {
  whatsapp_group_url: "https://chat.whatsapp.com/LamcXmaQlk7AOfGBFIoLuq",
  telegram_url: "https://t.me/ryzel_news",
  support_ticket_url: "https://t.me/ryzel_support",
  support_email: "",
  support_phone: "",
  announcement: "",
};

export async function getSiteSettings(db: Db) {
  const rows = await db.select().from(siteSettings);
  const values = { ...SITE_SETTINGS_DEFAULTS };
  for (const row of rows) values[row.key] = row.value;
  return values;
}

// A fixed, made-up key — not a real URL that's ever fetched — used purely
// as an identifier into Cloudflare's Cache API. Site settings (nav links,
// announcement banner) change rarely but were being fetched from Postgres
// on nearly every single page load, opening a DB connection each time
// for data that's almost always identical. That's real, avoidable
// pressure on Hyperdrive's connection pool. Caching for 60s means at
// most one DB hit per minute across ALL users combined, not one per
// request.
const SETTINGS_CACHE_KEY = new Request("https://ryzel-internal-cache.invalid/site-settings");

export async function purgeSiteSettingsCache(): Promise<void> {
  await caches.default.delete(SETTINGS_CACHE_KEY);
}

export const settingsRoutes = new Hono<{ Bindings: Env }>();

// No auth required — these are the links/contacts shown in the app nav.
settingsRoutes.get("/", async (c) => {
  const cached = await caches.default.match(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  const values = await withDb(c, (db) => getSiteSettings(db));
  const response = c.json(values);

  // Cache a CLONE, not the response itself — a Response body can only be
  // read once, and this same response still needs to go back to the
  // client that made this particular request.
  const toCache = response.clone();
  toCache.headers.set("Cache-Control", "public, max-age=60");
  c.executionCtx.waitUntil(caches.default.put(SETTINGS_CACHE_KEY, toCache));

  return response;
});