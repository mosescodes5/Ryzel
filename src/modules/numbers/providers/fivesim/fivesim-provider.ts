import type {
  ActivationCountry,
  ActivationOffer,
  ActivationOrder,
  ActivationProduct,
  ActivationProvider
} from '../activation-provider';
import * as fivesim from './client';
import type { FiveSimOrder } from './types';
import { PricingConfigError, toNaira } from '../../lib/naira';

/**
 * 5sim's `price` field is a decimal number in 5sim's own billing currency. It is
 * converted to WHOLE NAIRA with the admin-set rate (see lib/pricing/fx-rate.ts),
 * always rounded UP so a sale can never undercharge.
 *
 * `getRate` returns null when no rate is configured. Quoting and buying then fail
 * closed, but checking/cancelling existing orders must keep working — customers
 * are waiting for codes — so those paths use a rate-less mapping.
 */
export type RateResolver = () => Promise<number | null>;

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

function mapOrder(order: FiveSimOrder, rate: number | null): ActivationOrder {
  const latestSms = order.sms && order.sms.length > 0 ? order.sms[order.sms.length - 1] : null;
  return {
    providerOrderId: String(order.id),
    phoneNumber: order.phone,
    product: order.product,
    operator: order.operator,
    country: order.country,
    costNaira: rate === null ? 0 : toNaira(order.price, rate),
    status: mapStatus(order.status),
    smsCode: latestSms?.code ?? null,
    smsText: latestSms?.text ?? null,
    expiresAt: order.expires
  };
}

export class FiveSimProvider implements ActivationProvider {
  readonly name = '5sim';

  constructor(private readonly getRate: RateResolver) {}

  private async requireRate(): Promise<number> {
    const rate = await this.getRate();
    if (rate === null) {
      throw new PricingConfigError(
        'Number pricing is not set up yet: an admin needs to enter the dollar rate. Purchases are paused.'
      );
    }
    return rate;
  }

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
    const rate = await this.requireRate();
    const products = await fivesim.getGuestProducts(country, 'any');

    return Object.entries(products)
      .filter(([, entry]) => entry.Qty > 0)
      .map(([product, entry]) => ({
        product,
        operator: 'any',
        costNaira: toNaira(entry.Price, rate),
        quantity: entry.Qty
      }));
  }

  async listOffers({ country, product }: { country: string; product: string }): Promise<ActivationOffer[]> {
    const rate = await this.requireRate();
    const prices = await fivesim.getGuestPrices(country, product);
    const operators = prices[country]?.[product];

    if (!operators) return [];

    return Object.entries(operators)
      .filter(([, entry]) => entry.count > 0)
      .map(([operator, entry]) => ({
        operator,
        costNaira: toNaira(entry.cost, rate),
        successRate: entry.rate ?? null,
        quantity: entry.count
      }))
      .sort((a, b) => a.costNaira - b.costNaira);
  }

  async buyActivation(params: { country: string; operator: string; product: string }): Promise<ActivationOrder> {
    const rate = await this.requireRate(); // never buy without a price basis
    const order = await fivesim.buyActivation(params);
    return mapOrder(order, rate);
  }

  async checkOrder(providerOrderId: string): Promise<ActivationOrder> {
    const order = await fivesim.checkOrder(providerOrderId);
    return mapOrder(order, await this.getRate());
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    await fivesim.cancelOrder(providerOrderId);
  }

  async finishOrder(providerOrderId: string): Promise<void> {
    await fivesim.finishOrder(providerOrderId);
  }

  async listRecentActivations(limit: number) {
    return fivesim.listRecentActivations(limit);
  }
}
