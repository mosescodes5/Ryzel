import type { ActivationProvider } from './activation-provider';
import { FiveSimProvider } from './fivesim/fivesim-provider';

export function getActivationProvider(): ActivationProvider {
  const providerKey = process.env.PROVIDER || process.env.ACTIVATION_NUMBERS_PROVIDER || '5sim';

  switch (providerKey) {
    case '5sim':
    case 'fivesim':
      return new FiveSimProvider();
    default:
      throw new Error(`Unknown provider: ${providerKey}`);
  }
}
