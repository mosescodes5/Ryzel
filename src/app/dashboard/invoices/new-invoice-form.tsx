'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DButton } from '@/components/dashboard/ui';
import { createInvoiceAction } from './actions';

type Row = { description: string; quantity: string; unitPrice: string };

const EMPTY_ROW: Row = { description: '', quantity: '1', unitPrice: '' };

export function NewInvoiceForm() {
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [currency, setCurrency] = useState('NGN');

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const subtotal = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0);

  return (
    <form action={createInvoiceAction} className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-slate-500">Your business name (optional)</label>
        <input
          type="text"
          name="business_name"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">Customer name</label>
          <input
            type="text"
            name="customer_name"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Customer email (optional)</label>
          <input
            type="email"
            name="customer_email"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Line items</label>
        <div className="mt-1 flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                name="item_description"
                placeholder="Description"
                value={row.description}
                onChange={(e) => updateRow(i, 'description', e.target.value)}
                required
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <input
                type="number"
                name="item_quantity"
                min="1"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateRow(i, 'quantity', e.target.value)}
                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <input
                type="number"
                name="item_unit_price"
                step="0.01"
                placeholder="Price"
                value={row.unitPrice}
                onChange={(e) => updateRow(i, 'unitPrice', e.target.value)}
                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add line item
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">Currency</label>
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Due date (optional)</label>
          <input
            type="date"
            name="due_date"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
        <span className="text-sm text-slate-500">Subtotal</span>
        <span className="font-semibold text-slate-900">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(subtotal)}
        </span>
      </div>

      <DButton type="submit">Create invoice</DButton>
    </form>
  );
}
