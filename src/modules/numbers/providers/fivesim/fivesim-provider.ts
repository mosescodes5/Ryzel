import type {
  ActivationCountry,
  ActivationOffer,
  ActivationOrder,
  ActivationProduct,
  ActivationProvider
} from '../activation-provider';
import * as fivesim from './client';
import type { FiveSimOrder } from './types';

/**
 * 5sim's `price` field is a decimal major-unit number in 5sim's own
 * accounting currency. This app stores everything in minor units
 * ("cents") of your wallet's currency (NGN, given KORAPAY_DEFAULT_CURRENCY).
 *
 * If USD_NGN_RATE is set, this assumes 5sim's price is effectively in USD
 * and converts: NGN kobo = price * USD_NGN_RATE * 100. That assumption
 * needs verifying against a real 5sim invoice/receipt for your account —
 * 5sim has historically priced in RUB for some accounts, so confirm which
 * currency your account's `price` field is actually denominated in before
 * trusting the profit numbers.
 *
 * If USD_NGN_RATE isn't set, falls back to FIVESIM_RATE_TO_WALLET_MINOR_UNITS
 * ("how many wallet minor units equal 1 unit of 5sim's price field"),
 * then to a 1:1 placeholder — set one of these or costs will be wrong.
 */
function toWalletCents(fivesimPrice: number): number {
  const usdToNgn = process.env.USD_NGN_RATE ? Number(process.env.USD_NGN_RATE) : null;
  if (usdToNgn) {
    return Math.round(fivesimPrice * usdToNgn * 100);
  }
  const rate = Number(process.env.FIVESIM_RATE_TO_WALLET_MINOR_UNITS ?? '100');
  return Math.round(fivesimPrice * rate);
}

function mapStatus(status: FiveSimOrder['status']): ActivationOrder['status'] {
  switch (status) {
    case 'PENDING':
      return 'awaiting_sms';
    case 'RECEIVED':
      return 'received';
    case 'FINISHED':
      return 'finished';
    case 'CANCELED':
      return 'cancelled';
    case 'TIMEOUT':
      return 'expired';
    case 'BANNED':
      return 'failed';
    default:
      return 'awaiting_sms';
  }
}

function mapOrder(order: FiveSimOrder): ActivationOrder {
  const latestSms = order.sms && order.sms.length > 0 ? order.sms[order.sms.length - 1] : null;
  return {
    providerOrderId: String(order.id),
    phoneNumber: order.phone,
    product: order.product,
    operator: order.operator,
    country: order.country,
    costCents: toWalletCents(order.price),
    status: mapStatus(order.status),
    smsCode: latestSms?.code ?? null,
    smsText: latestSms?.text ?? null,
    expiresAt: order.expires
  };
}

export class FiveSimProvider implements ActivationProvider {
  readonly name = '5sim';

  async listCountries(): Promise<ActivationCountry[]> {
    const countries = await fivesim.getGuestCountries();

    return Object.entries(countries)
      .filter(([code]) => code !== 'default') // 5sim includes a "default" fallback entry that isn't a real country
      .map(([code, entry]) => ({
        code,
        name: entry.text_en ?? code.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listProducts({ country }: { country: string }): Promise<ActivationProduct[]> {
    const products = await fivesim.getGuestProducts(country, 'any');

    return Object.entries(products)
      .filter(([, entry]) => entry.Qty > 0)
      .map(([product, entry]) => ({
        product,
        operator: 'any',
        costCents: toWalletCents(entry.Price),
        quantity: entry.Qty
      }));
  }

  async listOffers({ country, product }: { country: string; product: string }): Promise<ActivationOffer[]> {
    const prices = await fivesim.getGuestPrices(country, product);
    const operators = prices[country]?.[product];

    if (!operators) return [];

    return Object.entries(operators)
      .filter(([, entry]) => entry.count > 0)
      .map(([operator, entry]) => ({
        operator,
        costCents: toWalletCents(entry.cost),
        successRate: entry.rate ?? null,
        quantity: entry.count
      }))
      .sort((a, b) => a.costCents - b.costCents);
  }

  async buyActivation(params: { country: string; operator: string; product: string }): Promise<ActivationOrder> {
    const order = await fivesim.buyActivation(params);
    return mapOrder(order);
  }

  async checkOrder(providerOrderId: string): Promise<ActivationOrder> {
    const order = await fivesim.checkOrder(providerOrderId);
    return mapOrder(order);
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    await fivesim.cancelOrder(providerOrderId);
  }

  async finishOrder(providerOrderId: string): Promise<void> {
    await fivesim.finishOrder(providerOrderId);
  }
}
