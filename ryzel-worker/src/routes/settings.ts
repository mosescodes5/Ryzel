import { Hono } from "hono";
import type { Env } from "../types";
import { withDb, type Db } from "../db/client";
import { siteSettings } from "../db/schema";

export const SITE_SETTINGS_DEFAULTS: Record<string, string> = {
  whatsapp_group_url: "https://chat.whatsapp.com/DwxCCgJzubs2SxY2eL3hG3?s=cl&p=i&mlu=4",
  telegram_url: "https://chat.whatsapp.com/DwxCCgJzubs2SxY2eL3hG3?s=cl&p=i&mlu=4",
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

export const settingsRoutes = new Hono<{ Bindings: Env }>();

// No auth required — these are the links/contacts shown in the app nav.
settingsRoutes.get("/", async (c) => {
  return withDb(c, async (db) => c.json(await getSiteSettings(db)));
});