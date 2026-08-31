import type { AppSettings } from "./config";

const BASE_URL = "https://api.korapay.com/merchant/api/v1";

export class KorapayError extends Error {}

function headers(settings: AppSettings): Record<string, string> {
  if (!settings.korapaySecretKey) {
    throw new KorapayError("KORAPAY_SECRET_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${settings.korapaySecretKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Creates a hosted checkout charge. Returns Korapay's `data` object, which
 * includes `checkout_url` to redirect the user to.
 */
export async function initializeCharge(
  settings: AppSettings,
  opts: { amountNgn: number; customerEmail: string; reference: string; redirectUrl: string }
): Promise<any> {
  const payload = {
    // Korapay's docs specify `amount` as an Integer — sending "2000.0"
    // (a float's JSON serialization) gets rejected outright as "one or
    // more fields are invalid" even though the value is whole. Round
    // first so a stray 2000.4x doesn't get silently truncated instead.
    amount: Math.round(opts.amountNgn),
    currency: "NGN",
    reference: opts.reference,
    customer: { email: opts.customerEmail, name: opts.customerEmail.split("@")[0] },
    redirect_url: opts.redirectUrl,
    narration: "Wallet top-up",
  };

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/charges/initialize`, {
      method: "POST",
      headers: headers(settings),
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new KorapayError(`Could not reach Korapay: ${(e as Error).message}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new KorapayError(`Korapay returned a non-JSON response (status ${response.status})`);
  }

  if (!data.status) {
    // The specific field problem lives in the nested `data` object, not
    // the top-level `message` (a generic "one or more fields are invalid"
    // wrapper) — surface both or you're debugging blind.
    let detail = data.message ?? "Korapay charge initialization failed";
    if (data.data) detail = `${detail} — details: ${JSON.stringify(data.data)}`;
    throw new KorapayError(detail);
  }
  return data.data;
}

/**
 * Always call this from the webhook handler before crediting a wallet —
 * never trust the webhook body's amount/status directly, since a forged
 * request could otherwise credit arbitrary amounts.
 */
export async function verifyTransaction(settings: AppSettings, reference: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/charges/${reference}`, { headers: headers(settings) });
  } catch (e) {
    throw new KorapayError(`Could not reach Korapay: ${(e as Error).message}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new KorapayError(`Korapay returned a non-JSON response (status ${response.status})`);
  }

  if (!data.status) {
    throw new KorapayError(data.message ?? "Could not verify transaction");
  }
  return data.data;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Korapay signs webhooks with HMAC-SHA256 of ONLY the `data` object inside
 * the payload (not the whole raw body — hashing the full body with the
 * "event" wrapper included never matches Korapay's signature, which is
 * exactly the bug that silently dropped every real webhook and left
 * wallets uncredited). See https://developers.korapay.com/docs/webhooks.
 */
export async function verifyWebhookSignature(
  settings: AppSettings,
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader || !settings.korapaySecretKey) return false;

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const dataObj = payload?.data;
  if (dataObj === undefined || dataObj === null) return false;

  // Korapay's own examples sign JSON.stringify(data) — compact, no spaces,
  // keys in original order. JSON.stringify with no indent argument matches
  // that as long as we don't re-sort keys (JS object key order from
  // JSON.parse preserves insertion order, so round-tripping is safe here).
  const serialized = JSON.stringify(dataObj);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(settings.korapaySecretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(serialized));
  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signatureHeader);
}
