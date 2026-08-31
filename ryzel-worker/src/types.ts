export interface Env {
  // Bindings
  HYPERDRIVE: Hyperdrive;

  // Rate limiting bindings — see wrangler.jsonc "unsafe.bindings"
  RATE_LIMIT_ORDERS_PRICE: RateLimit;
  RATE_LIMIT_ORDERS_BUY: RateLimit;
  RATE_LIMIT_ORDERS_CHECK: RateLimit;
  RATE_LIMIT_ORDERS_CANCEL: RateLimit;
  RATE_LIMIT_PAYMENTS_INIT: RateLimit;

  // Secrets (set via `wrangler secret put <NAME>`, never in wrangler.jsonc)
  SUPABASE_JWT_SECRET?: string; // legacy HS256 projects only
  KORAPAY_SECRET_KEY: string;
  KORAPAY_PUBLIC_KEY: string;
  BREVO_API_KEY?: string;
  FIVESIM_API_KEY?: string;
  SMSMAN_API_KEY?: string;
  PROVIDER_API_KEY?: string; // whichever provider is primary reads its key from this one

  // Plain vars (wrangler.jsonc "vars" — fine to commit, not secret)
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  PROVIDER: string;
  PROVIDER_BASE_URL: string;
  PROVIDER_FALLBACK: string;
  ADMIN_EMAILS: string;
  MARKUP_PERCENT: string;
  MARKUP_FLAT_NGN: string;
  MIN_PRICE_NGN: string;
  USD_NGN_RATE: string;
  ORDER_TIMEOUT_SECONDS: string;
  INVOICE_FEE_NGN: string;
  TRACKER_FEE_NGN: string;
  KORAPAY_REDIRECT_URL: string;
  BREVO_SENDER_EMAIL: string;
  BREVO_SENDER_NAME: string;
  CORS_ORIGINS: string;
}
