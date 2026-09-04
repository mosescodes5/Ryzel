import { cookies } from 'next/headers';
import { SUPPORTED_LOCALES, RTL_LOCALES, type Locale, type TrackDictionary } from './i18n-types';

const loaders: Record<Locale, () => Promise<{ default: TrackDictionary }>> = {
  en: () => import('./dictionaries/en'),
  fr: () => import('./dictionaries/fr'),
  es: () => import('./dictionaries/es'),
  pt: () => import('./dictionaries/pt'),
  ar: () => import('./dictionaries/ar')
};

/**
 * Reads the NEXT_LOCALE cookie set by middleware and returns both the
 * resolved locale and its dictionary. Server components only (uses
 * next/headers cookies()). Falls back to 'en' if the cookie is missing or
 * invalid, which shouldn't normally happen since middleware always sets it
 * on /track routes, but keeps this safe if called elsewhere.
 */
export async function getLocaleAndDictionary(): Promise<{
  locale: Locale;
  dir: 'ltr' | 'rtl';
  dict: TrackDictionary;
}> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('NEXT_LOCALE')?.value;
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as Locale)
    : 'en';
  const dict = (await loaders[locale]()).default;
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
  return { locale, dir, dict };
}