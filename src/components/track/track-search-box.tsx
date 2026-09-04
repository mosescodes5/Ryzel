'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function TrackSearchBox({
  autoFocus = true,
  placeholder,
  submitLabel
}: {
  autoFocus?: boolean;
  placeholder: string;
  submitLabel: string;
}) {
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
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B98AC]" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full rounded-md border border-white/15 bg-[#0B1220] py-3 ps-10 pe-3 text-sm text-[#F4F7FB] outline-none placeholder:text-[#8B98AC] focus:border-[#22D3EE]/60"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-md bg-gradient-to-r from-[#2563EB] to-[#22D3EE] px-5 py-3 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
      >
        {submitLabel}
      </button>
    </form>
  );
}