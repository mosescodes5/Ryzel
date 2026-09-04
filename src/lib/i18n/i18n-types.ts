export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'pt', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  ar: 'العربية'
};

export type TrackDictionary = {
  headerTagline: string;
  landing: {
    title: string;
    description: string;
    placeholder: string;
    submit: string;
  };
  result: {
    backLink: string;
    estimatedDelivery: string;
    deliveryHistory: string;
    notFoundTitle: string;
    notFoundBody: string;
  };
  status: {
    pending: string;
    received: string;
    in_transit: string;
    out_for_delivery: string;
    delivered: string;
    delayed: string;
    exception: string;
    cancelled: string;
  };
};