import { PackageSearch } from 'lucide-react';
import { TrackHeader } from '@/components/track/track-header';
import { TrackSearchBox } from '@/components/track/track-search-box';
import { getLocaleAndDictionary } from '@/lib/i18n/get-dictionary';

export default async function TrackLandingPage() {
  const { locale, dir, dict } = await getLocaleAndDictionary();

  return (
    <div dir={dir}>
      <TrackHeader locale={locale} tagline={dict.headerTagline} />
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center bg-[#05070C] px-6 py-24 text-center">
        <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#0B1220] text-[#22D3EE]">
          <PackageSearch className="h-7 w-7" />
        </span>
        <h1 className="font-display text-2xl font-semibold text-[#F4F7FB] sm:text-3xl">
          {dict.landing.title}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-[#8B98AC]">{dict.landing.description}</p>

        <div className="mt-8">
          <TrackSearchBox placeholder={dict.landing.placeholder} submitLabel={dict.landing.submit} />
        </div>
      </main>
    </div>
  );
}