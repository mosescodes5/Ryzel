'use client';

import { useRouter } from 'next/navigation';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/i18n-types';

export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();

  function handleChange(next: Locale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <select
      value={current}
      onChange={(e) => handleChange(e.target.value as Locale)}
      aria-label="Language"
      className="rounded-md border border-white/15 bg-[#0B1220] px-2.5 py-1.5 text-xs text-[#F4F7FB] outline-none focus:border-[#22D3EE]/60"
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <option key={locale} value={locale} className="bg-[#0B1220]">
          {LOCALE_LABELS[locale]}
        </option>
      ))}
    </select>
  );
}