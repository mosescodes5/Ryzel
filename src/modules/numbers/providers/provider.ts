import type { AvailableNumber, ProvisionedNumber } from '../types';

/**
 * Contract every number provider must implement (mock today; Twilio,
 * Telnyx, etc. later). The rest of the app talks to `NumberProvider`,
 * never to a specific vendor's SDK — swapping or adding a provider means
 * writing one new file in `providers/`, nothing else changes.
 */
export interface NumberProvider {
  readonly name: string;
  searchAvailableNumbers(params: { countryCode: string; areaCode?: string }): Promise<AvailableNumber[]>;
  provisionNumber(params: { providerNumberId: string }): Promise<ProvisionedNumber>;
  releaseNumber(params: { providerNumberId: string }): Promise<void>;
}
