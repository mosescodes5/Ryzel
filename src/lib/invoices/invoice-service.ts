import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type InvoiceRecord = Database['public']['Tables']['invoices']['Row'];
export type InvoiceItem = InvoiceRecord['items'][number];
export type InvoiceStatus = InvoiceRecord['status'];

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' }
];

export function calculateSubtotalCents(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
}

/** Next invoice number for this user, e.g. "INV-0007" — sequential per user, not globally. */
async function nextInvoiceNumber(userId: string): Promise<string> {
  const supabase = createClient();
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  return `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;
}

export async function createInvoice(input: {
  userId: string;
  customerName: string;
  customerEmail?: string;
  businessName?: string;
  items: InvoiceItem[];
  currency: string;
  notes?: string;
  dueDate?: string;
}): Promise<InvoiceRecord> {
  const supabase = createClient();

  // Retry on the rare case two invoices are created in the same instant and
  // both compute the same "next" number — the (user_id, invoice_number)
  // unique constraint (Postgres error 23505) catches the collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(input.userId);

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        user_id: input.userId,
        invoice_number: invoiceNumber,
        customer_name: input.customerName,
        customer_email: input.customerEmail || null,
        business_name: input.businessName || null,
        items: input.items,
        currency: input.currency,
        notes: input.notes || null,
        due_date: input.dueDate || null,
        subtotal_cents: calculateSubtotalCents(input.items),
        status: 'draft'
      })
      .select('*')
      .single();

    if (!error && data) return data;
    if (error?.code !== '23505') throw error ?? new Error('Could not create invoice');
  }

  throw new Error('Could not generate a unique invoice number — try again.');
}

export async function listInvoices(userId: string): Promise<InvoiceRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data;
}

export async function getInvoiceById(id: string, userId: string): Promise<InvoiceRecord | null> {
  const supabase = createClient();
  const { data } = await supabase.from('invoices').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return data;
}

export async function updateInvoiceStatus(id: string, userId: string, status: InvoiceStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}
