export type InitializeChargeParams = {
  reference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  redirectUrl: string;
};

export type InitializeChargeResult = {
  checkoutUrl: string;
  providerReference: string;
};

export type VerifyChargeResult = {
  status: 'success' | 'failed' | 'pending';
  amountCents: number;
  currency: string;
  providerReference: string;
};

/**
 * Contract every payment provider must implement. The rest of the app
 * (wallet top-up route, webhook handler) talks to `PaymentProvider`, never
 * to a specific gateway's SDK — adding a second provider later means
 * writing one new file here, nothing else changes.
 */
export interface PaymentProvider {
  readonly name: string;
  initializeCharge(params: InitializeChargeParams): Promise<InitializeChargeResult>;
  verifyCharge(reference: string): Promise<VerifyChargeResult>;
  /** Returns true if the given raw request body was genuinely sent by this provider. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean>;
}
