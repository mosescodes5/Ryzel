export type AvailableNumber = {
  providerNumberId: string;
  phoneNumber: string;
  countryCode: string;
  areaCode?: string;
  monthlyPriceCents: number;
};

export type ProvisionedNumber = {
  providerNumberId: string;
  phoneNumber: string;
  status: 'active' | 'failed';
};

export type InboundSms = {
  fromNumber: string;
  toNumber: string;
  body: string;
  receivedAt: string;
};
