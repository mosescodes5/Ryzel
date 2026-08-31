"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select, Pill } from "@/components/ui";
import * as api from "@/lib/api";
import { isInsufficientBalanceError } from "@/lib/errors";
import { CURRENCIES, LANGUAGES, formatCurrency } from "@/lib/currencies";

// The platform fee is always charged from the NGN wallet regardless of
// what currency the invoice itself is issued in — kept separate from
// formatCurrency, which renders the invoice's own totals.
function formatNgn(amount) {
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

const STATUS_TONE = {
  draft: "neutral",
  sent: "amber",
  paid: "mint",
  void: "red",
};

const EMPTY_ITEM = { description: "", quantity: 1, unit_price: 0 };

export default function InvoicesView({ onBalanceChange, onInsufficientBalance, invoiceFeeNgn = 50 }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxPercent, setTaxPercent] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [currency, setCurrency] = useState("NGN");
  const [language, setLanguage] = useState("en");

  const load = () => {
    setLoading(true);
    api
      .listInvoices()
      .then(setInvoices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; setState only happens after the async request resolves, not synchronously
  load();
}, []);

  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );
  const taxAmount = subtotal * ((Number(taxPercent) || 0) / 100);
  const total = subtotal + taxAmount;

  function updateItem(idx, field, value) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");

    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.description.trim())) {
      setError("Every line item needs a description");
      return;
    }

    setCreating(true);
    try {
      const invoice = await api.createInvoice({
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        client_address: clientAddress.trim() || null,
        currency,
        language,
        line_items: items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        })),
        tax_percent: Number(taxPercent) || 0,
        notes: notes.trim() || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });

      setInvoices((prev) => [invoice, ...prev]);
      setSelected(invoice);
      onBalanceChange?.();

      // reset form
      setClientName("");
      setClientEmail("");
      setClientAddress("");
      setDueDate("");
      setTaxPercent(0);
      setNotes("");
      setItems([{ ...EMPTY_ITEM }]);
      setCurrency("NGN");
      setLanguage("en");
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(invoice, status) {
    const updated = await api.updateInvoiceStatus(invoice.id, status);
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    if (selected?.id === updated.id) setSelected(updated);
  }

  async function handleDelete(invoice) {
    if (!confirm(`Delete invoice ${invoice.invoice_number}? This can't be undone.`)) return;
    await api.deleteInvoice(invoice.id);
    setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
    if (selected?.id === invoice.id) setSelected(null);
  }

  if (selected) {
    return <InvoiceDetail invoice={selected} onBack={() => setSelected(null)} onStatusChange={handleStatusChange} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-display font-bold text-[1.15rem] mb-1">Create an invoice</h2>
        <p className="text-[0.85rem] text-ink-soft mb-5">
          Costs {formatNgn(invoiceFeeNgn)} from your wallet per invoice created. Editing and marking status afterward is free.
        </p>

        <form onSubmit={handleCreate} className="flex flex-col gap-1">
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Client name">
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Ltd" required />
            </Field>
            <Field label="Client email (optional)">
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
            </Field>
          </div>

          <Field label="Client address (optional)">
            <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="123 Marina Road, Lagos" />
          </Field>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Line items">
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_110px_32px] sm:grid-cols-[1fr_80px_130px_36px] gap-2 items-center">
                  <Input
                    value={it.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    placeholder="Description"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    placeholder="Qty"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.unit_price}
                    onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                    placeholder="Unit price"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    className="text-ink-faint hover:text-red disabled:opacity-30 text-lg leading-none"
                    aria-label="Remove line item"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="self-start text-[0.82rem] font-semibold text-mint hover:underline mt-1"
              >
                + Add line item
              </button>
            </div>
          </Field>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Tax (%)">
              <Input type="number" min="0" step="0.1" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </Field>
            <Field label="Due date (optional)">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note, etc." />
          </Field>

          <div className="flex items-center justify-between border-t border-line mt-2 pt-4">
            <div className="text-[0.85rem] text-ink-soft">
              Subtotal {formatCurrency(subtotal, currency)} · Tax {formatCurrency(taxAmount, currency)}
              <div className="font-display font-bold text-[1.05rem] text-ink">
                Total {formatCurrency(total, currency)}
              </div>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : `Create — ${formatNgn(invoiceFeeNgn)}`}
            </Button>
          </div>

          {error && (
            <div className="bg-red-soft text-red text-[0.85rem] px-3 py-2.5 rounded-lg mt-3 flex items-center justify-between gap-3 flex-wrap">
              <span>{error}</span>
              {isInsufficientBalanceError(error) && (
                <button onClick={onInsufficientBalance} className="font-semibold underline shrink-0">
                  Fund wallet
                </button>
              )}
            </div>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="font-display font-bold text-[1.05rem] mb-4">Your invoices</h2>
        {loading ? (
          <p className="text-ink-soft text-[0.9rem]">Loading…</p>
        ) : invoices.length === 0 ? (
          <p className="text-ink-soft text-[0.9rem]">No invoices yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-line hover:border-line-strong cursor-pointer"
                onClick={() => setSelected(inv)}
              >
                <div>
                  <div className="font-semibold text-[0.92rem]">{inv.invoice_number} — {inv.client_name}</div>
                  <div className="text-[0.8rem] text-ink-soft">{new Date(inv.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[0.9rem]">{formatCurrency(inv.total, inv.currency)}</span>
                  <Pill tone={STATUS_TONE[inv.status]}>{inv.status}</Pill>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(inv);
                    }}
                    className="text-ink-faint hover:text-red text-[0.8rem]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InvoiceDetail({ invoice, onBack, onStatusChange }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={onBack} className="text-[0.85rem] text-ink-soft hover:text-ink">
          ← Back to invoices
        </button>
        <div className="flex items-center gap-2">
          <Select value={invoice.status} onChange={(e) => onStatusChange(invoice, e.target.value)}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </Select>
          <Button variant="ghost" onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>
      </div>

      <div id="invoice-print-area">
        <Card className="max-w-2xl mx-auto print:border-0 print:shadow-none">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="font-display font-bold text-[1.3rem]">Invoice {invoice.invoice_number}</div>
              <div className="text-[0.85rem] text-ink-soft">
                Issued {new Date(invoice.issue_date).toLocaleDateString()}
                {invoice.due_date && ` · Due ${new Date(invoice.due_date).toLocaleDateString()}`}
              </div>
            </div>
            <Pill tone={STATUS_TONE[invoice.status]}>{invoice.status}</Pill>
          </div>

          <div className="mb-8">
            <div className="text-[0.78rem] font-semibold text-ink-soft uppercase tracking-wide mb-1">Billed to</div>
            <div className="font-semibold">{invoice.client_name}</div>
            {invoice.client_email && <div className="text-[0.85rem] text-ink-soft">{invoice.client_email}</div>}
            {invoice.client_address && <div className="text-[0.85rem] text-ink-soft">{invoice.client_address}</div>}
          </div>

          <table className="w-full text-[0.88rem] mb-6">
            <thead>
              <tr className="border-b border-line text-left text-ink-soft text-[0.78rem] uppercase tracking-wide">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((it, idx) => (
                <tr key={idx} className="border-b border-line/50">
                  <td className="py-2">{it.description}</td>
                  <td className="py-2 text-right">{it.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(it.unit_price, invoice.currency)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(it.quantity * it.unit_price, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full max-w-[220px] flex flex-col gap-1 text-[0.9rem]">
              <div className="flex justify-between text-ink-soft">
                <span>Subtotal</span>
                <span className="font-mono">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Tax ({invoice.tax_percent}%)</span>
                <span className="font-mono">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-[1.05rem] border-t border-line pt-2 mt-1">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-8 pt-4 border-t border-line text-[0.85rem] text-ink-soft">{invoice.notes}</div>
          )}
        </Card>
      </div>
    </div>
  );
}