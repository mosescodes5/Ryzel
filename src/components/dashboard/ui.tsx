import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

export function DCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}
      {...props}
    />
  );
}

type DButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success';
};

export function DButton({ variant = 'primary', className, ...props }: DButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'ghost' && 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700',
        className
      )}
      {...props}
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  finished: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  received: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  active: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  awaiting_sms: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  expired: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
};

const STATUS_LABEL: Record<string, string> = {
  finished: 'Finished',
  received: 'Code received',
  active: 'Active',
  awaiting_sms: 'Waiting for code',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Failed'
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
