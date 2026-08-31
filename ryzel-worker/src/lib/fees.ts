import { inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { siteSettings } from "../db/schema";
import type { AppSettings } from "./config";

/**
 * Same pattern as pricing.ts's usd_ngn_rate/min_price_ngn: the env vars
 * (INVOICE_FEE_NGN, TRACKER_FEE_NGN) are only the fallback default.
 * Once an admin saves through PUT /admin/fees, the site_settings row
 * takes precedence — no redeploy needed to change a fee.
 */
const INVOICE_FEE_KEY = "invoice_fee_ngn";
const TRACKER_FEE_KEY = "tracker_fee_ngn";

export interface FeesConfig {
  invoiceFeeNgn: number;
  trackerFeeNgn: number;
}

export async function getFeesConfig(db: Db | null, settings: AppSettings): Promise<FeesConfig> {
  const fees: FeesConfig = {
    invoiceFeeNgn: settings.invoiceFeeNgn,
    trackerFeeNgn: settings.trackerFeeNgn,
  };

  if (!db) return fees;

  const rows = await db.query.siteSettings.findMany({
    where: inArray(siteSettings.key, [INVOICE_FEE_KEY, TRACKER_FEE_KEY]),
  });
  for (const row of rows) {
    const parsed = parseFloat(row.value);
    if (Number.isNaN(parsed)) continue;
    if (row.key === INVOICE_FEE_KEY) fees.invoiceFeeNgn = parsed;
    if (row.key === TRACKER_FEE_KEY) fees.trackerFeeNgn = parsed;
  }

  return fees;
}

export async function saveFeesConfig(db: Db, invoiceFeeNgn: number, trackerFeeNgn: number): Promise<void> {
  for (const [key, value] of [
    [INVOICE_FEE_KEY, invoiceFeeNgn],
    [TRACKER_FEE_KEY, trackerFeeNgn],
  ] as const) {
    await db
      .insert(siteSettings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: String(value), updatedAt: new Date() } });
  }
}
