export type FiveSimErrorCode =
  | "AUTH" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "SERVER" | "NOT_FOUND"
  | "MALFORMED_RESPONSE" | "NO_STOCK" | "INSUFFICIENT_PROVIDER_BALANCE"
  | "INSUFFICIENT_PROVIDER_RATING" | "INVALID_SELECTION" | "PROVIDER_OFFLINE"
  | "ORDER_NOT_FOUND" | "ORDER_EXPIRED" | "ORDER_HAS_SMS" | "HOSTING_ORDER" | "BAD_REQUEST" | "UNKNOWN";

export class FiveSimError extends Error {
  readonly code: FiveSimErrorCode;
  readonly httpStatus: number | undefined;
  readonly retryable: boolean;
  /** Short provider text (never includes credentials). */
  readonly providerMessage: string | undefined;

  constructor(p: {
    code: FiveSimErrorCode; message: string; httpStatus?: number; retryable?: boolean;
    providerMessage?: string; cause?: unknown;
  }) {
    super(p.message, p.cause !== undefined ? { cause: p.cause } : undefined);
    this.name = "FiveSimError";
    this.code = p.code;
    this.httpStatus = p.httpStatus;
    this.retryable = p.retryable ?? false;
    this.providerMessage = p.providerMessage;
  }
}

/** 5SIM returns plain-text error bodies (documented list). Map them to codes. */
export function classifyProviderMessage(text: string): FiveSimErrorCode | null {
  const t = text.trim().toLowerCase();
  if (t.includes("no free phones")) return "NO_STOCK";
  if (t.includes("not enough user balance")) return "INSUFFICIENT_PROVIDER_BALANCE";
  if (t.includes("not enough rating")) return "INSUFFICIENT_PROVIDER_RATING";
  if (t.includes("server offline")) return "PROVIDER_OFFLINE";
  if (t.includes("order not found")) return "ORDER_NOT_FOUND";
  if (t.includes("order expired")) return "ORDER_EXPIRED";
  if (t.includes("order has sms")) return "ORDER_HAS_SMS";
  if (t.includes("hosting order")) return "HOSTING_ORDER";
  if (/(select country|select operator|bad country|bad operator|no product|country is incorrect|product is incorrect)/.test(t))
    return "INVALID_SELECTION";
  return null;
}
