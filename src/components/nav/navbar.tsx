import Link from 'next/link';

const links = [{ href: '/dashboard', label: 'Dashboard' }];

export function Navbar() {
  return (
    <header className="border-b border-white/10 bg-[#05070C]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-display bg-gradient-to-r from-[#2563EB] to-[#22D3EE] bg-clip-text text-lg font-semibold tracking-tight text-transparent"
        >
          ryzel
        </Link>
        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[#8B98AC] transition-colors duration-150 hover:text-[#F4F7FB]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-3.5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}