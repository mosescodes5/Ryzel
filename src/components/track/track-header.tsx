import Link from 'next/link';
import { LanguageSwitcher } from '@/components/track/language-switcher';
import type { Locale } from '@/lib/i18n/i18n-types';

export function TrackHeader({ locale, tagline }: { locale: Locale; tagline: string }) {
  return (
    <header className="border-b border-white/10 bg-[#05070C]">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/track" className="font-display text-lg tracking-tight text-[#F4F7FB]">
          ryzel{' '}
          <span className="bg-gradient-to-r from-[#2563EB] to-[#22D3EE] bg-clip-text text-transparent">
            {tagline}
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <LanguageSwitcher current={locale} />
        </div>
      </div>
    </header>
  );
}