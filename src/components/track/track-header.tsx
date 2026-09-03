import Link from 'next/link';

export function TrackHeader() {
  return (
    <header className="border-b border-ink-700">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/track" className="font-display text-lg tracking-tight text-mist-100">
          ryzel <span className="text-signal-400">track</span>
        </Link>
        <a
          href="https://ryzel.online"
          className="text-sm text-mist-400 hover:text-mist-100"
        >
          ryzel.online →
        </a>
      </div>
    </header>
  );
}
