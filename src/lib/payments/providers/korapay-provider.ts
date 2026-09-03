import type {
  InitializeChargeParams,
  InitializeChargeResult,
  PaymentProvider,
  VerifyChargeResult
} from './payment-provider';

const KORAPAY_BASE_URL = 'https://api.korapay.com/merchant/api/v1';

/**
 * Korapay (https://developers.korapay.com) — checkout-redirect flow.
 *
 * Flow: initializeCharge() creates a charge and returns a checkout_url the
 * customer is redirected to. Korapay then redirects back to `redirectUrl`
 * and, separately, POSTs a webhook to /api/v1/wallet/webhook. The webhook
 * handler calls verifyCharge() before crediting the wallet — never trust
 * the redirect alone, since it's client-controlled.
 *
 * Amounts: this app stores balances/prices in minor units ("cents") for
 * currency-agnostic math. Korapay's API expects amounts in the currency's
 * base unit (e.g. naira, not kobo), so this provider converts at the edge.
 */
export class KorapayProvider implements PaymentProvider {
  readonly name = 'korapay';

  private get secretKey() {
    const key = process.env.KORAPAY_SECRET_KEY;
    if (!key) throw new Error('KORAPAY_SECRET_KEY is not set');
    return key;
  }

  async initializeCharge(params: InitializeChargeParams): Promise<InitializeChargeResult> {
    const res = await fetch(`${KORAPAY_BASE_URL}/charges/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`
      },
      body: JSON.stringify({
        reference: params.reference,
        amount: params.amountCents / 100,
        currency: params.currency,
        redirect_url: params.redirectUrl,
        customer: {
          email: params.customerEmail,
          name: params.customerName
        }
      })
    });

    const body = await res.json();

    if (!res.ok || !body.status) {
      throw new Error(body.message ?? 'Korapay charge initialization failed');
    }

    return {
      checkoutUrl: body.data.checkout_url,
      providerReference: body.data.reference
    };
  }

  async verifyCharge(reference: string): Promise<VerifyChargeResult> {
    const res = await fetch(`${KORAPAY_BASE_URL}/charges/${reference}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` }
    });

    const body = await res.json();

    if (!res.ok || !body.status) {
      throw new Error(body.message ?? 'Korapay charge verification failed');
    }

    const rawStatus = (body.data.status ?? '').toLowerCase();
    const status: VerifyChargeResult['status'] =
      rawStatus === 'success' ? 'success' : rawStatus === 'failed' ? 'failed' : 'pending';

    return {
      status,
      amountCents: Math.round(Number(body.data.amount) * 100),
      currency: body.data.currency,
      providerReference: body.data.reference
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    if (!signatureHeader) return Promise.resolve(false);

    let payload: { data?: unknown };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Promise.resolve(false);
    }

    // Korapay signs only the `data` object of the payload, not the whole body.
    // Uses the standard Web Crypto API (crypto.subtle) rather than Node's
    // `crypto` module so this runs unmodified on Cloudflare Workers, Vercel
    // Edge, or a plain Node server — no runtime-specific polyfills needed.
    return hmacSha256Hex(this.secretKey, JSON.stringify(payload.data ?? {})).then((expected) =>
      timingSafeEqualHex(expected, signatureHeader)
    );
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison — avoids leaking the expected signature via timing. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
