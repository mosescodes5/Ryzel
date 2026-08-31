export const CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira (NGN)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
  { code: "GHS", label: "Ghanaian Cedi (GHS)" },
  { code: "KES", label: "Kenyan Shilling (KES)" },
  { code: "XOF", label: "West African CFA Franc (XOF)" },
  { code: "EGP", label: "Egyptian Pound (EGP)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "AED", label: "UAE Dirham (AED)" },
  { code: "MXN", label: "Mexican Peso (MXN)" },
  { code: "COP", label: "Colombian Peso (COP)" },
  { code: "BRL", label: "Brazilian Real (BRL)" },
  { code: "ARS", label: "Argentine Peso (ARS)" },
  { code: "CLP", label: "Chilean Peso (CLP)" },
  { code: "PEN", label: "Peruvian Sol (PEN)" },
  { code: "JPY", label: "Japanese Yen (JPY)" },
  { code: "CNY", label: "Chinese Yuan (CNY)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "SEK", label: "Swedish Krona (SEK)" },
  { code: "NOK", label: "Norwegian Krone (NOK)" },
  { code: "DKK", label: "Danish Krone (DKK)" },
  { code: "PLN", label: "Polish Zloty (PLN)" },
  { code: "TRY", label: "Turkish Lira (TRY)" },
  { code: "SAR", label: "Saudi Riyal (SAR)" },
  { code: "QAR", label: "Qatari Riyal (QAR)" },
  { code: "MAD", label: "Moroccan Dirham (MAD)" },
];

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
];

// Used for displaying an invoice's own totals in whatever currency the
// invoice was created in — separate from formatNgn, which is always the
// platform's wallet/fee currency regardless of what the invoice itself uses.
export function formatCurrency(amount, currencyCode = "NGN") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `${currencyCode} ${Number(amount).toLocaleString()}`;
  }
}