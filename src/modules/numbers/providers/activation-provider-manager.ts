import type { ActivationProvider } from './activation-provider';
import { FiveSimProvider } from './fivesim/fivesim-provider';
import { getNairaPerUnitOrNull } from '@/lib/pricing/fx-rate';

export function getActivationProvider(): ActivationProvider {
  const providerKey = process.env.PROVIDER || process.env.ACTIVATION_NUMBERS_PROVIDER || '5sim';

  switch (providerKey) {
    case '5sim':
    case 'fivesim':
      return new FiveSimProvider(getNairaPerUnitOrNull);
    default:
      throw new Error(`Unknown provider: ${providerKey}`);
  }
}
