'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createInvoice, updateInvoiceStatus, type InvoiceItem, type InvoiceStatus } from '@/lib/invoices/invoice-service';

async function requireUser() {
  const { user } = await getCurrentUserWithRole();
  if (!user) throw new Error('Sign in required');
  return user;
}

export async function createInvoiceAction(formData: FormData) {
  const user = await requireUser();

  const descriptions = formData.getAll('item_description') as string[];
  const quantities = formData.getAll('item_quantity') as string[];
  const unitPrices = formData.getAll('item_unit_price') as string[];

  const items: InvoiceItem[] = descriptions
    .map((description, i) => ({
      description: description.trim(),
      quantity: Number(quantities[i]) || 0,
      unit_price_cents: Math.round(Number(unitPrices[i] || 0) * 100)
    }))
    .filter((item) => item.description && item.quantity > 0);

  if (items.length === 0) throw new Error('Add at least one line item');

  const invoice = await createInvoice({
    userId: user.id,
    customerName: String(formData.get('customer_name') ?? ''),
    customerEmail: String(formData.get('customer_email') ?? ''),
    businessName: String(formData.get('business_name') ?? ''),
    items,
    currency: String(formData.get('currency') ?? 'NGN'),
    notes: String(formData.get('notes') ?? ''),
    dueDate: String(formData.get('due_date') ?? '') || undefined
  });

  revalidatePath('/dashboard/invoices');
  redirect(`/dashboard/invoices/${invoice.id}`);
}

export async function updateInvoiceStatusAction(formData: FormData) {
  const user = await requireUser();

  const invoiceId = String(formData.get('invoice_id') ?? '');
  const status = String(formData.get('status') ?? '') as InvoiceStatus;
  if (!invoiceId || !status) throw new Error('Missing invoice or status');

  await updateInvoiceStatus(invoiceId, user.id, status);

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath('/dashboard/invoices');
}
