import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { listInvoices, INVOICE_STATUSES } from '@/lib/invoices/invoice-service';
import { DCard, PageHeader } from '@/components/dashboard/ui';
import { NewInvoiceForm } from './new-invoice-form';

function statusLabel(status: string) {
  return INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function statusColor(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'overdue':
    case 'cancelled':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'sent':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

export default async function InvoicesPage() {
  const { user } = await getCurrentUserWithRole();
  if (!user) redirect('/login');

  const invoices = await listInvoices(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoice generator"
        description="Create a professional invoice for a customer and share the link — no design work needed."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DCard className="p-0">
            {invoices.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No invoices yet — create your first one on the right.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-medium">Invoice</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
                          className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">{invoice.customer_name}</td>
                      <td className="px-5 py-3.5 text-slate-900">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(
                          invoice.subtotal_cents / 100
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusColor(invoice.status)}`}
                        >
                          {statusLabel(invoice.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DCard>
        </div>

        <DCard className="h-fit">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Plus className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-slate-900">New invoice</p>
          </div>
          <NewInvoiceForm />
        </DCard>
      </div>
    </div>
  );
}
