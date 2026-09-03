import type { NumberProvider } from './provider';
import { MockNumberProvider } from './mock-provider';

/**
 * Single place that decides which provider implementation is live.
 * Real carriers register here behind the NUMBERS_PROVIDER env var —
 * nothing else in the app needs to know a new one was added.
 */
export function getNumberProvider(): NumberProvider {
  const providerKey = process.env.NUMBERS_PROVIDER ?? 'mock';

  switch (providerKey) {
    case 'mock':
      return new MockNumberProvider();
    // case 'twilio':
    //   return new TwilioNumberProvider();
    default:
      throw new Error(`Unknown NUMBERS_PROVIDER: ${providerKey}`);
  }
}
