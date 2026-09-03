import type { PaymentProvider } from './payment-provider';
import { KorapayProvider } from './korapay-provider';

/**
 * Single place that decides which payment gateway is live, same pattern
 * as `modules/numbers/providers/provider-manager.ts`. Adding a second
 * gateway later means one new file + one new case here.
 */
export function getPaymentProvider(): PaymentProvider {
  const providerKey = process.env.PAYMENTS_PROVIDER ?? 'korapay';

  switch (providerKey) {
    case 'korapay':
      return new KorapayProvider();
    default:
      throw new Error(`Unknown PAYMENTS_PROVIDER: ${providerKey}`);
  }
}
