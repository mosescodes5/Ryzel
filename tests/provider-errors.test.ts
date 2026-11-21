import { describe, expect, it } from 'vitest';
import { isDefiniteNonPurchase, customerMessageForRejection } from '../src/modules/numbers/lib/provider-errors';

describe('isDefiniteNonPurchase: only a clear refusal makes a refund safe', () => {
  it('4xx refusals are definite', () => {
    for (const status of [400, 401, 402, 403, 404, 429]) {
      expect(isDefiniteNonPurchase({ kind: 'http', status, body: '' })).toBe(true);
    }
  });
  it('timeouts, dropped connections, 5xx and unreadable replies are UNCERTAIN', () => {
    expect(isDefiniteNonPurchase({ kind: 'timeout' })).toBe(false);
    expect(isDefiniteNonPurchase({ kind: 'network', message: 'reset' })).toBe(false);
    for (const status of [500, 502, 503, 504, 520]) {
      expect(isDefiniteNonPurchase({ kind: 'http', status, body: '' })).toBe(false);
    }
    expect(isDefiniteNonPurchase({ kind: 'invalid_response', message: 'x' })).toBe(false);
  });
});

describe('customerMessageForRejection', () => {
  it('never leaks the raw provider body', () => {
    const msg = customerMessageForRejection({ kind: 'http', status: 400, body: 'not enough user balance SECRET-DETAIL' });
    expect(msg).not.toContain('SECRET-DETAIL');
    expect(msg).toContain('not been charged');
  });
  it('explains out-of-stock', () => {
    expect(customerMessageForRejection({ kind: 'http', status: 400, body: 'no free phones' })).toContain('No numbers');
  });
});
