import type { FiveSimSms } from "../../providers/fivesim/schemas";

/**
 * Activation SMS objects have no id in the 5SIM docs, so dedupe on a deterministic fingerprint of
 * (provider order id + every SMS field). Re-polling the same SMS yields the same fingerprint, so a
 * UNIQUE(provider_order_id, fingerprint) constraint makes upserts idempotent.
 * Uses Web Crypto (Node 20+, Deno/Supabase Edge).
 */
export async function smsFingerprint(providerOrderId: string, sms: FiveSimSms): Promise<string> {
  const canonical = JSON.stringify([providerOrderId, sms.id ?? null, sms.created_at ?? null, sms.date ?? null, sms.sender, sms.text, sms.code]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
