'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function TrackSearchBox({ autoFocus = true }: { autoFocus?: boolean }) {
  const [value, setValue] = useState('');
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/track/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          placeholder="e.g. RYZ-7K4Q-9MXP"
          className="w-full rounded-sm border border-ink-700 bg-ink-900 py-3 pl-10 pr-3 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-signal-500"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-sm bg-signal-500 px-5 py-3 text-sm font-medium text-ink-950 hover:bg-signal-400"
      >
        Track
      </button>
    </form>
  );
}
