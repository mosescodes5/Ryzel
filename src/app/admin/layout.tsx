import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';

// Pricing and Settings moved into /dashboard (Admin section of the main
// dashboard sidebar) — see src/app/dashboard/admin/*. This legacy panel
// keeps the deeper reporting/management tools that don't need to live in
// the everyday dashboard.
const links = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orders', label: 'Orders & Profit' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/users', label: 'Users' }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getCurrentUserWithRole();

  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      <aside className="w-56 shrink-0 border-r border-slate-200 px-4 py-8">
        <p className="mb-8 font-display text-lg text-slate-900">ryzel admin</p>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/dashboard"
          className="mt-8 block rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
