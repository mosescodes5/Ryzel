import { describe, expect, it } from "vitest";
import { canBan, canCancel, canFinish, canTransition, mapProviderStatus, nextPollDelayMs, refundDecision, shouldPoll, type ActivationView } from "../src/modules/activations/status";

const now = new Date("2026-01-01T00:10:00Z");
const base: ActivationView = { internalState: "waiting_for_sms", providerStatus: "PENDING", smsCount: 0, expiresAt: new Date("2026-01-01T00:15:00Z"), now };

describe("status mapping", () => {
  it("uses the SMS array, not the RECEIVED label", () => {
    expect(mapProviderStatus("RECEIVED", 0)).toBe("waiting_for_sms");
    expect(mapProviderStatus("RECEIVED", 1)).toBe("sms_received");
    expect(mapProviderStatus("PENDING", 1)).toBe("sms_received");
    expect(mapProviderStatus("TIMEOUT", 0)).toBe("timed_out");
  });
});
describe("guards", () => {
  it("cancel only with no SMS, unexpired, active", () => {
    expect(canCancel(base).allowed).toBe(true);
    expect(canCancel({ ...base, smsCount: 1 })).toEqual({ allowed: false, reason: "SMS_ALREADY_RECEIVED" });
    expect(canCancel({ ...base, now: new Date("2026-01-01T00:16:00Z") })).toEqual({ allowed: false, reason: "ORDER_EXPIRED" });
    expect(canCancel({ ...base, providerStatus: "CANCELED" }).allowed).toBe(false);
  });
  it("finish requires an SMS; ban disabled until verified", () => {
    expect(canFinish(base).allowed).toBe(false);
    expect(canFinish({ ...base, internalState: "sms_received", providerStatus: "RECEIVED", smsCount: 1 }).allowed).toBe(true);
    expect(canBan({ ...base, smsCount: 1 }, { semanticsVerified: false })).toEqual({ allowed: false, reason: "BAN_SEMANTICS_UNVERIFIED" });
  });
});
describe("refund decision", () => {
  it("refunds only confirmed cancel/timeout with zero SMS; odd cases go to review", () => {
    expect(refundDecision("CANCELED", 0)).toBe("refund");
    expect(refundDecision("TIMEOUT", 0)).toBe("refund");
    expect(refundDecision("TIMEOUT", 1)).toBe("needs_review");
    expect(refundDecision("CANCELED", 1)).toBe("needs_review");
    expect(refundDecision("BANNED", 1)).toBe("needs_review");
    expect(refundDecision("FINISHED", 1)).toBe("no_refund");
    expect(refundDecision("PENDING", 0)).toBe("wait");
  });
});
describe("state machine + polling", () => {
  it("blocks illegal transitions and double refunds", () => {
    expect(canTransition("created", "funds_reserved")).toBe(true);
    expect(canTransition("funds_reserved", "waiting_for_sms")).toBe(false);
    expect(canTransition("refunded", "refund_pending")).toBe(false);
    expect(canTransition("provider_request_started", "provider_reconciliation_required")).toBe(true);
    expect(canTransition("provider_reconciliation_required", "failed")).toBe(true);
  });
  it("stops polling terminal orders and bounds polling after expiry", () => {
    expect(shouldPoll(base)).toBe(true);
    expect(shouldPoll({ ...base, providerStatus: "FINISHED" })).toBe(false);
    expect(shouldPoll({ ...base, now: new Date("2026-01-01T00:20:00Z") })).toBe(false);
  });
  it("backs off and caps", () => {
    expect(nextPollDelayMs(0)).toBe(3000);
    expect(nextPollDelayMs(2)).toBe(12_000);
    expect(nextPollDelayMs(20)).toBe(60_000);
  });
});
