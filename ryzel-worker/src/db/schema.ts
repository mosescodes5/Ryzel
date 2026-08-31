import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";

/**
 * Postgres NUMERIC columns come back from `pg` as strings (avoids silent
 * float precision loss on the driver side) — Drizzle 0.36's built-in
 * `numeric()` reflects that with dataType: 'string' and has no
 * `mode: "number"` escape hatch the way `bigint()` does. Money fields here
 * are small enough (₦ amounts, USD costs) that float precision loss isn't
 * a practical concern, and the rest of the app (routes, the original
 * Python/SQLModel code) already treats these as plain numbers — so this
 * custom type does the string<->number conversion at the boundary once,
 * here, instead of wrapping every read/write in Number()/String() across
 * every route file.
 */
function numericColumn(precision: number, scale: number) {
  return customType<{ data: number; driverData: string }>({
    dataType() {
      return `numeric(${precision}, ${scale})`;
    },
    fromDriver(value: string): number {
      return parseFloat(value);
    },
    toDriver(value: number): string {
      return value.toString();
    },
  });
}

const money = numericColumn(14, 2); // ₦ amounts — matches numeric(14,2) in supabase_schema.sql
const usdCost = numericColumn(10, 4); // matches numeric(10,4)
const percent = numericColumn(5, 2); // matches numeric(5,2)

// NOTE: auth.users lives in Supabase's own schema and isn't modeled here —
// we only ever reference its `id` (uuid) as a foreign key value, same as
// the Python backend did. Drizzle doesn't need the referenced table defined
// to use a plain uuid column; the actual FK constraint already exists in
// the database from supabase_schema.sql and doesn't need to be redeclared
// here for the app to function correctly.

export const wallets = pgTable("wallets", {
  userId: uuid("user_id").primaryKey(),
  email: text("email"),
  walletBalanceNgn: money("wallet_balance_ngn").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull(),
  amountNgn: money("amount_ngn").notNull(),
  reason: text("reason").notNull(),
  orderId: bigint("order_id", { mode: "number" }),
  balanceAfterNgn: money("balance_after_ngn").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pendingPayments = pgTable("pending_payments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  reference: text("reference").notNull().unique(),
  userId: uuid("user_id").notNull(),
  amountNgn: money("amount_ngn").notNull(),
  status: text("status").notNull().default("pending"), // pending | success | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const orders = pgTable("orders", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull(),

  service: text("service").notNull(),
  country: text("country").notNull(),

  providerName: text("provider_name").notNull(),
  providerOrderId: text("provider_order_id").notNull(),
  phoneNumber: text("phone_number").notNull(),

  costUsd: usdCost("cost_usd").notNull(),
  priceNgn: money("price_ngn").notNull(),

  status: text("status").notNull().default("pending"), // pending | received | expired | cancelled
  smsCode: text("sms_code"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const invoices = pgTable("invoices", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull(),

  invoiceNumber: text("invoice_number").notNull(),

  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  clientAddress: text("client_address"),

  currency: text("currency").notNull().default("NGN"),
  // BCP-47-ish language tag for rendering the invoice (e.g. "en", "fr",
  // "pt") — set by whoever creates the invoice, independent of currency.
  language: text("language").notNull().default("en"),
  lineItems: jsonb("line_items").notNull().default([]),

  taxPercent: percent("tax_percent").notNull().default(0),
  notes: text("notes"),

  subtotal: money("subtotal").notNull(),
  taxAmount: money("tax_amount").notNull(),
  total: money("total").notNull(),

  status: text("status").notNull().default("draft"), // draft | sent | paid | void

  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipments = pgTable("shipments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").notNull(),

  trackingCode: text("tracking_code").notNull().unique(),

  carrierStyle: text("carrier_style").notNull().default("generic"), // dhl | fedex | ups | generic
  carrierName: text("carrier_name"),

  senderName: text("sender_name"),
  recipientName: text("recipient_name"),
  origin: text("origin"),
  destination: text("destination"),
  packageDescription: text("package_description"),

  // Set by whoever creates the tracker — lets the public tracking page
  // render in the sender's chosen currency/language (mirrors the same
  // two fields on invoices).
  currency: text("currency").notNull().default("NGN"),
  language: text("language").notNull().default("en"),

  status: text("status").notNull().default("label_created"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),

  events: jsonb("events").notNull().default([]),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});