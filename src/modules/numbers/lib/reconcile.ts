/**
 * Decides what to do with orders stuck in 'purchasing' (wallet debited, but we
 * never recorded whether the provider really sold us a number).
 *
 * The rule that protects customers' money AND yours:
 *   - ADOPT an upstream order only when it matches exactly one of our orders
 *     and our order matches exactly one upstream order.
 *   - REFUND only on positive evidence of absence: the provider's recent
 *     history was read successfully, covers the time window, shows no
 *     matching order, and enough time has passed.
 *   - Anything unclear goes to a human ('review'); money stays held.
 */

export type PurchasingOrder = {
  id: string;
  country: string;
  product: string;
  operator: string; // the pool the customer picked; 'any' matches every operator
  startedAtMs: number;
};

export type UpstreamActivation = {
  providerOrderId: string;
  createdAtMs: number;
  country: string;
  product: string;
  operator: string | null; // history may not include it
};

export type ReconcileDecision =
  | { action: 'adopt'; upstream: UpstreamActivation }
  | { action: 'refund' }
  | { action: 'review'; note: string }
  | { action: 'wait' };

export const CLOCK_SKEW_MS = 60_000; // provider clock vs ours
export const MATCH_WINDOW_MS = 5 * 60_000; // a buy must show up within 5 min of our attempt
export const ABSENCE_WAIT_MS = 10 * 60_000; // how long we wait before trusting "not there"

export function reconcileBatch(args: {
  orders: PurchasingOrder[];
  upstream: UpstreamActivation[];
  claimedProviderIds: Set<string>; // upstream ids already attached to some order of ours
  historyFetchedOk: boolean;
  historyCoversWindow: boolean;
  nowMs: number;
}): Map<string, ReconcileDecision> {
  const out = new Map<string, ReconcileDecision>();
  if (!args.historyFetchedOk) {
    for (const o of args.orders) out.set(o.id, { action: 'wait' });
    return out;
  }

  const free = args.upstream.filter((u) => !args.claimedProviderIds.has(u.providerOrderId));

  const candidatesFor = (o: PurchasingOrder) =>
    free.filter(
      (u) =>
        u.country === o.country &&
        u.product === o.product &&
        (o.operator === 'any' || u.operator === null || u.operator === o.operator) &&
        u.createdAtMs >= o.startedAtMs - CLOCK_SKEW_MS &&
        u.createdAtMs <= o.startedAtMs + MATCH_WINDOW_MS
    );

  const byOrder = new Map<string, UpstreamActivation[]>();
  const ordersPerUpstream = new Map<string, number>();
  for (const o of args.orders) {
    const c = candidatesFor(o);
    byOrder.set(o.id, c);
    for (const u of c) ordersPerUpstream.set(u.providerOrderId, (ordersPerUpstream.get(u.providerOrderId) ?? 0) + 1);
  }

  for (const o of args.orders) {
    const c = byOrder.get(o.id) ?? [];
    const first = c[0];
    if (c.length === 1 && first && ordersPerUpstream.get(first.providerOrderId) === 1) {
      out.set(o.id, { action: 'adopt', upstream: first });
    } else if (c.length >= 1) {
      out.set(o.id, {
        action: 'review',
        note: `Ambiguous: ${c.length} provider order(s) could match this purchase, shared with other pending purchases.`
      });
    } else if (args.nowMs - o.startedAtMs >= ABSENCE_WAIT_MS && args.historyCoversWindow) {
      out.set(o.id, { action: 'refund' });
    } else {
      out.set(o.id, { action: 'wait' });
    }
  }
  return out;
}
