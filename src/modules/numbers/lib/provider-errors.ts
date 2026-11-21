/**
 * Why a provider call failed matters more than that it failed: for a PURCHASE,
 * "the provider said no" means nothing was bought (safe to refund), while
 * "we never heard back" means a number may exist upstream (NOT safe to refund
 * until we've checked).
 */
export type ProviderFailure =
  | { kind: 'http'; status: number; body: string }
  | { kind: 'network'; message: string }
  | { kind: 'timeout' }
  | { kind: 'invalid_response'; message: string };

export class ProviderError extends Error {
  readonly failure: ProviderFailure;
  constructor(failure: ProviderFailure) {
    super(describeFailure(failure));
    this.name = 'ProviderError';
    this.failure = failure;
  }
}

function describeFailure(f: ProviderFailure): string {
  switch (f.kind) {
    case 'http':
      return `Provider returned HTTP ${f.status}`;
    case 'network':
      return `Provider unreachable: ${f.message}`;
    case 'timeout':
      return 'Provider timed out';
    case 'invalid_response':
      return `Provider sent an unreadable response: ${f.message}`;
  }
}

/**
 * True ONLY when the provider clearly rejected the request, so no number was
 * bought. Everything else (timeouts, dropped connections, 5xx, garbled
 * replies) is UNCERTAIN: the purchase may have gone through.
 */
export function isDefiniteNonPurchase(f: ProviderFailure): boolean {
  return f.kind === 'http' && f.status >= 400 && f.status < 500;
}

/** Customer-safe wording; never leaks the raw provider body. */
export function customerMessageForRejection(f: ProviderFailure): string {
  if (f.kind === 'http') {
    const body = f.body.toLowerCase();
    if (body.includes('no free phones') || body.includes('no numbers')) {
      return 'No numbers are available for that service right now. You have not been charged.';
    }
  }
  return 'We could not get a number for you this time. You have not been charged.';
}
