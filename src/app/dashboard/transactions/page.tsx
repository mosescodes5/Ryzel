import { redirect } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DCard, PageHeader } from '@/components/dashboard/ui';
import { formatCents } from '@/lib/utils';

const REASON_LABEL: Record<string, string> = {
  wallet_topup: 'Wallet top-up',
  number_purchase: 'Number purchase',
  refund: 'Refund'
};

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, type, amount_cents, currency, reason, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transactions" description="Every credit and debit on your wallet." />

      <DCard className="p-0">
        {!transactions || transactions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      tx.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {tx.type === 'credit' ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {REASON_LABEL[tx.reason] ?? tx.reason}
                    </p>
                    <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '−'}
                  {formatCents(tx.amount_cents, tx.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DCard>
    </div>
  );
}
