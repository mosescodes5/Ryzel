import Link from 'next/link';

const links = [{ href: '/dashboard', label: 'Dashboard' }];

export function Navbar() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg tracking-tight text-slate-900">
          ryzel
        </Link>
        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
