import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, desc, count } from "drizzle-orm";
import type { Env } from "../types";
import type { CurrentUser } from "../middleware/auth";
import { requireAuth, invalidateAuthCache } from "../middleware/auth";
import { withDb, type Db } from "../db/client";
import { invoices, wallets, ledgerEntries } from "../db/schema";
import { getSettings } from "../lib/config";
import { getFeesConfig } from "../lib/fees";

type Vars = { user: CurrentUser };
export const invoiceRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

invoiceRoutes.use("*", requireAuth);

interface LineItemIn {
  description: string;
  quantity?: number;
  unit_price: number;
}

function serializeInvoice(inv: typeof invoices.$inferSelect) {
  return {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    client_name: inv.clientName,
    client_email: inv.clientEmail,
    client_address: inv.clientAddress,
    currency: inv.currency,
    language: inv.language,
    line_items: inv.lineItems,
    tax_percent: inv.taxPercent,
    notes: inv.notes,
    subtotal: inv.subtotal,
    tax_amount: inv.taxAmount,
    total: inv.total,
    status: inv.status,
    issue_date: inv.issueDate,
    due_date: inv.dueDate,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt,
  };
}

// Accepts either a plain `Db` or the `tx` object inside a `db.transaction`
// callback — both expose the same query-builder methods this needs, but
// carry distinct TypeScript types, hence `any` here rather than `Db`.
async function generateInvoiceNumber(db: any, userId: string) {
  const year = new Date().getUTCFullYear();
  const [{ value }] = await db.select({ value: count() }).from(invoices).where(eq(invoices.userId, userId));
  return `INV-${year}-${String(value + 1).padStart(4, "0")}`;
}

invoiceRoutes.get("/", async (c) => {
  const user = c.get("user");

  return withDb(c, async (db) => {
    const rows = await db.query.invoices.findMany({
      where: eq(invoices.userId, user.id),
      orderBy: [desc(invoices.createdAt)],
    });
    return c.json(rows.map(serializeInvoice));
  });
});

invoiceRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));

  return withDb(c, async (db) => {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!inv || inv.userId !== user.id) throw new HTTPException(404, { message: "Invoice not found" });
    return c.json(serializeInvoice(inv));
  });
});

invoiceRoutes.post("/", async (c) => {
  const user = c.get("user");
  const settings = getSettings(c.env);
  const body = await c.req.json<{
    client_name: string;
    client_email?: string | null;
    client_address?: string | null;
    currency?: string;
    language?: string;
    line_items: LineItemIn[];
    tax_percent?: number;
    notes?: string | null;
    due_date?: string | null;
  }>();

  if (!body.line_items || body.line_items.length === 0) {
    throw new HTTPException(400, { message: "At least one line item is required" });
  }
  if (!body.client_name?.trim()) {
    throw new HTTPException(400, { message: "Client name is required" });
  }

  const items = body.line_items.map((it) => ({
    description: it.description,
    quantity: it.quantity ?? 1,
    unit_price: it.unit_price,
  }));
  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const taxPercent = body.tax_percent ?? 0;
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal + taxAmount;

  return withDb(c, async (db) => {
    const fees = await getFeesConfig(db, settings);
    const fee = fees.invoiceFeeNgn;

    // Everything that touches money and the invoice row lives inside one
    // transaction. Previously the invoice insert and the wallet debit
    // were two separate statements — if the request got interrupted
    // (client cancelled, a crash, anything) between them, the invoice
    // could exist with the fee never deducted. `db.transaction` makes
    // this atomic: either every write below commits together, or none
    // of them do. `.for("update")` locks the wallet row for the
    // duration too, so two simultaneous invoice creations from the same
    // user can't both read the same starting balance and both succeed
    // when only one should.
    const created = await db.transaction(async (tx) => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, user.id)).for("update");
      if (!wallet) throw new HTTPException(500, { message: "Wallet not found" });
      if (wallet.walletBalanceNgn < fee) {
        throw new HTTPException(402, {
          message: `Insufficient wallet balance — creating an invoice costs \u20a6${fee.toFixed(0)}`,
        });
      }

      const newBalance = wallet.walletBalanceNgn - fee;
      const invoiceNumber = await generateInvoiceNumber(tx, user.id);

      const [inv] = await tx
        .insert(invoices)
        .values({
          userId: user.id,
          invoiceNumber,
          clientName: body.client_name.trim(),
          clientEmail: body.client_email ?? null,
          clientAddress: body.client_address ?? null,
          currency: body.currency ?? "NGN",
          language: body.language ?? "en",
          lineItems: items,
          taxPercent,
          notes: body.notes ?? null,
          subtotal,
          taxAmount,
          total,
          dueDate: body.due_date ? new Date(body.due_date) : null,
        })
        .returning();

      await tx.update(wallets).set({ walletBalanceNgn: newBalance }).where(eq(wallets.userId, user.id));
      await tx.insert(ledgerEntries).values({
        userId: user.id,
        amountNgn: -fee,
        reason: "invoice_fee",
        balanceAfterNgn: newBalance,
      });

      return inv;
    });

    invalidateAuthCache(user.id);

    return c.json(serializeInvoice(created));
  });
});

invoiceRoutes.patch("/:id/status", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const { status } = await c.req.json<{ status: string }>();

  return withDb(c, async (db) => {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!inv || inv.userId !== user.id) throw new HTTPException(404, { message: "Invoice not found" });

    const [updated] = await db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)))
      .returning();

    return c.json(serializeInvoice(updated));
  });
});

invoiceRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));

  return withDb(c, async (db) => {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!inv || inv.userId !== user.id) throw new HTTPException(404, { message: "Invoice not found" });

    await db.delete(invoices).where(eq(invoices.id, id));
    return c.json({ deleted: true });
  });
});