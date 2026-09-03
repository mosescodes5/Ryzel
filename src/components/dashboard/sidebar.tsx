'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Wallet,
  ClipboardList,
  History,
  UserCircle,
  MessageCircle,
  Tag,
  Settings,
  Shield,
  Radio,
  LayoutGrid,
  Receipt,
  Users,
  Layers,
  PackageSearch,
  FileText
} from 'lucide-react';
import { cn, formatCents } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const MAIN_LINKS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/wallet', label: 'Fund Wallet', icon: Wallet },
  { href: '/dashboard/orders', label: 'Order History', icon: ClipboardList },
  { href: '/dashboard/transactions', label: 'Transactions', icon: History },
  { href: '/dashboard/packages', label: 'Package Tracker', icon: PackageSearch },
  { href: '/dashboard/invoices', label: 'Invoice Generator', icon: FileText },
  { href: '/dashboard/account', label: 'Account', icon: UserCircle }
];

const ADMIN_LINKS: NavItem[] = [
  { href: '/dashboard/admin', label: 'Overview', icon: LayoutGrid },
  { href: '/dashboard/admin/orders', label: 'Orders & Profit', icon: Receipt },
  { href: '/dashboard/admin/pricing', label: 'Pricing', icon: Tag },
  { href: '/dashboard/admin/services', label: 'Services', icon: Layers },
  { href: '/dashboard/admin/packages', label: 'Package Tracker (Admin)', icon: PackageSearch },
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/settings', label: 'Settings', icon: Settings }
];

// '/dashboard' and '/dashboard/admin' are index pages with their own
// nested routes (e.g. /dashboard/admin/orders) — those need an exact
// match so the index link doesn't stay highlighted on every sub-page.
const EXACT_MATCH_HREFS = new Set(['/dashboard', '/dashboard/admin']);

function isActive(pathname: string, href: string) {
  return EXACT_MATCH_HREFS.has(href) ? pathname === href : pathname.startsWith(href);
}

export function Sidebar({
  displayName,
  email,
  walletBalanceCents,
  role,
  whatsappGroupLink
}: {
  displayName: string | null;
  email: string;
  walletBalanceCents: number;
  role: 'user' | 'admin';
  whatsappGroupLink: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-brand-700 px-4 py-6">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
          <Radio className="h-4 w-4 text-white" />
        </span>
        <span className="font-display text-lg font-semibold text-white">ryzel</span>
      </Link>

      <div className="mb-6 rounded-xl bg-emerald-500 px-4 py-3.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-950/70">
          Wallet balance
        </p>
        <p className="mt-0.5 text-xl font-semibold text-emerald-950">
          {formatCents(walletBalanceCents)}
        </p>
      </div>

      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
        Menu
      </p>
      <nav className="flex flex-col gap-0.5">
        {MAIN_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-white text-brand-700'
                  : 'text-brand-100 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {whatsappGroupLink && (
        <a
          href={whatsappGroupLink}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp Community
        </a>
      )}

      {role === 'admin' && (
        <>
          <p className="mb-2 mt-6 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
            <Shield className="h-3 w-3" /> Admin
          </p>
          <nav className="flex flex-col gap-0.5">
            {ADMIN_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-white text-brand-700'
                      : 'text-brand-100 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2 pt-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
          {(displayName ?? email).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{displayName ?? 'Account'}</p>
          <p className="truncate text-xs text-brand-200">{email}</p>
        </div>
      </div>
    </aside>
  );
}
