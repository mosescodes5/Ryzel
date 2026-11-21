import { describe, expect, it } from 'vitest';
import {
  reconcileBatch,
  ABSENCE_WAIT_MS,
  type PurchasingOrder,
  type UpstreamActivation
} from '../src/modules/numbers/lib/reconcile';

const T0 = 1_700_000_000_000;
const order = (id: string, over: Partial<PurchasingOrder> = {}): PurchasingOrder => ({
  id, country: 'nigeria', product: 'telegram', operator: 'any', startedAtMs: T0, ...over
});
const up = (id: string, over: Partial<UpstreamActivation> = {}): UpstreamActivation => ({
  providerOrderId: id, createdAtMs: T0 + 5_000, country: 'nigeria', product: 'telegram', operator: null, ...over
});
const base = { claimedProviderIds: new Set<string>(), historyFetchedOk: true, historyCoversWindow: true };

describe('reconcileBatch', () => {
  it('adopts when exactly one upstream order matches exactly one of ours', () => {
    const r = reconcileBatch({ ...base, orders: [order('a')], upstream: [up('u1')], nowMs: T0 + 60_000 });
    expect(r.get('a')).toEqual({ action: 'adopt', upstream: up('u1') });
  });

  it('never refunds when the history could not be read', () => {
    const r = reconcileBatch({ ...base, historyFetchedOk: false, orders: [order('a')], upstream: [], nowMs: T0 + 99 * 60_000 });
    expect(r.get('a')).toEqual({ action: 'wait' });
  });

  it('never refunds when the history does not cover the purchase window', () => {
    const r = reconcileBatch({ ...base, historyCoversWindow: false, orders: [order('a')], upstream: [], nowMs: T0 + 99 * 60_000 });
    expect(r.get('a')).toEqual({ action: 'wait' });
  });

  it('waits before trusting an empty history, then refunds on proof of absence', () => {
    const early = reconcileBatch({ ...base, orders: [order('a')], upstream: [], nowMs: T0 + ABSENCE_WAIT_MS - 1 });
    expect(early.get('a')).toEqual({ action: 'wait' });
    const late = reconcileBatch({ ...base, orders: [order('a')], upstream: [], nowMs: T0 + ABSENCE_WAIT_MS });
    expect(late.get('a')).toEqual({ action: 'refund' });
  });

  it('ignores upstream orders already attached to another of our orders', () => {
    const r = reconcileBatch({ ...base, claimedProviderIds: new Set(['u1']), orders: [order('a')], upstream: [up('u1')], nowMs: T0 + ABSENCE_WAIT_MS });
    expect(r.get('a')).toEqual({ action: 'refund' });
  });

  it('sends two competing purchases for one upstream order to review, never guessing', () => {
    const r = reconcileBatch({ ...base, orders: [order('a'), order('b')], upstream: [up('u1')], nowMs: T0 + 60_000 });
    expect(r.get('a')?.action).toBe('review');
    expect(r.get('b')?.action).toBe('review');
  });

  it('two purchases and two upstream orders is ambiguous, not paired by luck', () => {
    const r = reconcileBatch({ ...base, orders: [order('a'), order('b')], upstream: [up('u1'), up('u2')], nowMs: T0 + 60_000 });
    expect(r.get('a')?.action).toBe('review');
    expect(r.get('b')?.action).toBe('review');
  });

  it('does not match a different country, product, operator or time window', () => {
    const wrong = [
      up('x1', { country: 'russia' }),
      up('x2', { product: 'whatsapp' }),
      up('x3', { createdAtMs: T0 + 10 * 60_000 }),
      up('x4', { createdAtMs: T0 - 5 * 60_000 })
    ];
    const r = reconcileBatch({ ...base, orders: [order('a')], upstream: wrong, nowMs: T0 + 60_000 });
    expect(r.get('a')).toEqual({ action: 'wait' });
    const op = reconcileBatch({ ...base, orders: [order('a', { operator: 'virtual21' })], upstream: [up('u1', { operator: 'beeline' })], nowMs: T0 + 60_000 });
    expect(op.get('a')).toEqual({ action: 'wait' });
  });
});
