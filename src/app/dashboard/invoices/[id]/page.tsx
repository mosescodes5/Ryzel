import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { getInvoiceById, INVOICE_STATUSES } from '@/lib/invoices/invoice-service';
import { DCard, DButton } from '@/components/dashboard/ui';
import { updateInvoiceStatusAction } from '../actions';
import { PrintButton } from './print-button';

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getCurrentUserWithRole();
  if (!user) redirect('/login');

  const invoice = await getInvoiceById(params.id, user.id);
  if (!invoice) notFound();

  const total = invoice.subtotal_cents;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All invoices
        </Link>
        <div className="flex items-center gap-2">
          <form action={updateInvoiceStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <select
              name="status"
              defaultValue={invoice.status}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {INVOICE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <DButton type="submit" variant="secondary">
              Update status
            </DButton>
          </form>
          <PrintButton />
        </div>
      </div>

      <DCard className="mx-auto w-full max-w-2xl p-10 print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg text-slate-900">{invoice.business_name || 'Invoice'}</p>
            <p className="mt-1 text-sm text-slate-500">Invoice {invoice.invoice_number}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
            {invoice.status}
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Billed to</p>
            <p className="mt-1 font-medium text-slate-900">{invoice.customer_name}</p>
            {invoice.customer_email && <p className="text-slate-500">{invoice.customer_email}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Date</p>
            <p className="mt-1 text-slate-700">{new Date(invoice.created_at).toLocaleDateString()}</p>
            {invoice.due_date && (
              <>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">Due</p>
                <p className="mt-1 text-slate-700">{new Date(invoice.due_date).toLocaleDateString()}</p>
              </>
            )}
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-3 text-slate-800">{item.description}</td>
                <td className="py-3 text-right text-slate-600">{item.quantity}</td>
                <td className="py-3 text-right text-slate-600">
                  {formatMoney(item.unit_price_cents, invoice.currency)}
                </td>
                <td className="py-3 text-right text-slate-900">
                  {formatMoney(item.quantity * item.unit_price_cents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-48">
            <div className="flex justify-between border-t border-slate-200 py-2 text-sm font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatMoney(total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 border-t border-slate-100 pt-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
            <p className="mt-1 text-sm text-slate-600">{invoice.notes}</p>
          </div>
        )}
      </DCard>
    </div>
  );
}
