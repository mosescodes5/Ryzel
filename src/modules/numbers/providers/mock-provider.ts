import type { NumberProvider } from './provider';
import type { AvailableNumber, ProvisionedNumber } from '../types';

/**
 * Deterministic fake provider so the marketplace, checkout, and SMS
 * inbox flows can be built and demoed before a real carrier is wired up.
 * Never used to imply a real, working phone line — see README.
 */
export class MockNumberProvider implements NumberProvider {
  readonly name = 'mock';

  async searchAvailableNumbers({ countryCode, areaCode }: { countryCode: string; areaCode?: string }): Promise<AvailableNumber[]> {
    const base = areaCode ?? '555';
    return Array.from({ length: 5 }).map((_, i) => ({
      providerNumberId: `mock_${countryCode}_${base}_${1000 + i}`,
      phoneNumber: `+1${base}${(1000 + i).toString().padStart(7, '0')}`,
      countryCode,
      areaCode: base,
      monthlyPriceCents: 499
    }));
  }

  async provisionNumber({ providerNumberId }: { providerNumberId: string }): Promise<ProvisionedNumber> {
    return {
      providerNumberId,
      phoneNumber: providerNumberId.split('_').slice(2).join(''),
      status: 'active'
    };
  }

  async releaseNumber(): Promise<void> {
    // no-op for the mock provider
  }
}
