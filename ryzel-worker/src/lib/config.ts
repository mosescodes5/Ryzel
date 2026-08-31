import type { Env } from "../types";

/**
 * Cloudflare Workers vars always arrive as strings, unlike Python's
 * pydantic-settings which parses .env values into their declared types
 * automatically. This centralizes the float/int parsing so route code
 * reads clean numbers, same as `settings.markup_percent` did before.
 */
export function getSettings(env: Env) {
  return {
    environment: env.ENVIRONMENT,
    supabaseUrl: env.SUPABASE_URL,

    provider: env.PROVIDER,
    providerBaseUrl: env.PROVIDER_BASE_URL,
    providerFallback: env.PROVIDER_FALLBACK
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    providerApiKey: env.PROVIDER_API_KEY ?? "",
    smsmanApiKey: env.SMSMAN_API_KEY ?? "",

    adminEmails: new Set(
      env.ADMIN_EMAILS.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),

    usdNgnRate: parseFloat(env.USD_NGN_RATE),
    markupPercent: parseFloat(env.MARKUP_PERCENT),
    markupFlatNgn: parseFloat(env.MARKUP_FLAT_NGN),
    minPriceNgn: parseFloat(env.MIN_PRICE_NGN),

    orderTimeoutSeconds: parseInt(env.ORDER_TIMEOUT_SECONDS, 10),

    invoiceFeeNgn: parseFloat(env.INVOICE_FEE_NGN),
    trackerFeeNgn: parseFloat(env.TRACKER_FEE_NGN),

    korapaySecretKey: env.KORAPAY_SECRET_KEY,
    korapayPublicKey: env.KORAPAY_PUBLIC_KEY,
    korapayRedirectUrl: env.KORAPAY_REDIRECT_URL,

    brevoApiKey: env.BREVO_API_KEY ?? "",
    brevoSenderEmail: env.BREVO_SENDER_EMAIL,
    brevoSenderName: env.BREVO_SENDER_NAME,

    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export type AppSettings = ReturnType<typeof getSettings>;
