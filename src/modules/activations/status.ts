import type { ProviderStatus } from "../../providers/fivesim/schemas";

export const INTERNAL_STATES = [
  "created", "funds_reserved", "provider_request_started", "provider_order_created", "number_assigned",
  "waiting_for_sms", "sms_received", "completed", "cancel_requested", "canceled", "timed_out",
  "refund_pending", "refunded", "provider_reconciliation_required", "failed",
] as const;
export type InternalState = (typeof INTERNAL_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<InternalState> = new Set(["completed", "refunded", "failed"]);

const T: Record<InternalState, InternalState[]> = {
  created: ["funds_reserved", "failed"],
  funds_reserved: ["provider_request_started", "failed"],
  provider_request_started: ["provider_order_created", "provider_reconciliation_required", "failed"],
  provider_order_created: ["number_assigned", "provider_reconciliation_required"],
  number_assigned: ["waiting_for_sms", "sms_received", "provider_reconciliation_required"],
  waiting_for_sms: ["sms_received", "cancel_requested", "canceled", "timed_out", "completed", "provider_reconciliation_required"],
  sms_received: ["sms_received", "completed", "timed_out", "provider_reconciliation_required"],
  cancel_requested: ["canceled", "waiting_for_sms", "sms_received", "timed_out", "provider_reconciliation_required"],
  canceled: ["refund_pending"],
  timed_out: ["refund_pending", "completed"],
  refund_pending: ["refunded", "provider_reconciliation_required"],
  provider_reconciliation_required: [
    "provider_order_created", "waiting_for_sms", "sms_received", "completed", "canceled", "timed_out", "refund_pending", "failed",
  ],
  completed: [],
  refunded: [],
  failed: [],
};

export function canTransition(from: InternalState, to: InternalState): boolean {
  return T[from].includes(to);
}

/**
 * Provider status -> internal state. The SMS array, not the label, decides "received":
 * the docs word RECEIVED as "waiting of receipt of SMS" but their example shows RECEIVED with an SMS.
 * BANNED maps to completed; refundDecision() separately forces human review.
 */
export function mapProviderStatus(status: ProviderStatus, smsCount: number): InternalState {
  switch (status) {
    case "PENDING": return smsCount > 0 ? "sms_received" : "waiting_for_sms";
    case "RECEIVED": return smsCount > 0 ? "sms_received" : "waiting_for_sms";
    case "FINISHED": return "completed";
    case "CANCELED": return "canceled";
    case "TIMEOUT": return "timed_out";
    case "BANNED": return "completed";
  }
}

export interface ActivationView {
  internalState: InternalState;
  providerStatus: ProviderStatus;
  smsCount: number;
  expiresAt: Date;
  now: Date;
}

type Guard = { allowed: true } | { allowed: false; reason: string };
const no = (reason: string): Guard => ({ allowed: false, reason });

/** Provider rejects cancel with "order has sms" / "order expired", so pre-check both. */
export function canCancel(a: ActivationView): Guard {
  if (a.providerStatus !== "PENDING" && a.providerStatus !== "RECEIVED") return no("PROVIDER_STATUS_TERMINAL");
  if (a.smsCount > 0) return no("SMS_ALREADY_RECEIVED");
  if (a.now >= a.expiresAt) return no("ORDER_EXPIRED");
  if (a.internalState !== "waiting_for_sms") return no("INTERNAL_STATE_NOT_CANCELLABLE");
  return { allowed: true };
}

/** Finishing only after an SMS actually exists. */
export function canFinish(a: ActivationView): Guard {
  if (a.providerStatus !== "RECEIVED" && a.providerStatus !== "PENDING") return no("PROVIDER_STATUS_TERMINAL");
  if (a.smsCount === 0) return no("NO_SMS_YET");
  if (a.internalState !== "sms_received") return no("INTERNAL_STATE_NOT_FINISHABLE");
  return { allowed: true };
}

/** Ban semantics and endpoint are inconsistent in the docs. Disabled until verified with a test order. */
export function canBan(a: ActivationView, opts: { semanticsVerified: boolean }): Guard {
  if (!opts.semanticsVerified) return no("BAN_SEMANTICS_UNVERIFIED");
  if (a.smsCount === 0) return no("NO_SMS_YET");
  if (a.providerStatus === "BANNED" || a.providerStatus === "CANCELED" || a.providerStatus === "TIMEOUT") return no("PROVIDER_STATUS_TERMINAL");
  return { allowed: true };
}

export type RefundDecision = "refund" | "no_refund" | "wait" | "needs_review";

/**
 * Refund only on CONFIRMED provider outcome with zero SMS. Anything odd goes to a human.
 * Never driven by a frontend timer. Idempotency is enforced by the ledger reference, not here.
 */
export function refundDecision(status: ProviderStatus, smsCount: number): RefundDecision {
  switch (status) {
    case "PENDING":
    case "RECEIVED": return "wait";
    case "FINISHED": return "no_refund";
    case "CANCELED":
    case "TIMEOUT": return smsCount === 0 ? "refund" : "needs_review";
    case "BANNED": return "needs_review";
  }
}

/** Keep polling provider-active orders, plus a short grace after `expires` to catch the final status. */
export function shouldPoll(a: Pick<ActivationView, "providerStatus" | "expiresAt" | "now">, graceMs = 120_000): boolean {
  if (a.providerStatus !== "PENDING" && a.providerStatus !== "RECEIVED") return false;
  return a.now.getTime() <= a.expiresAt.getTime() + graceMs;
}

/** Exponential backoff on consecutive failures: 3s, 6s, 12s ... capped at 60s. `jitter` in [0,1). */
export function nextPollDelayMs(consecutiveFailures: number, jitter = 0): number {
  const base = Math.min(60_000, 3_000 * 2 ** Math.max(0, consecutiveFailures));
  return Math.round(base * (1 + 0.2 * jitter));
}
