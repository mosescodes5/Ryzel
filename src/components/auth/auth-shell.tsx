import Link from 'next/link';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <Link href="/" className="mb-8 font-display text-lg tracking-tight text-slate-900">
        ryzel
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8">{children}</div>
    </main>
  );
}
