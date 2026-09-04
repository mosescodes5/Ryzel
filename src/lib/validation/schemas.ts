import { z } from 'zod';

export const topupSchema = z.object({
  // Plain naira (up to 2dp), despite the field name — see korapay-provider.ts.
  // 5,000,000 sanity ceiling ~ equivalent real-world scale to the old
  // 500,000,000 kobo ceiling; adjust if you want a different circuit breaker.
  amountCents: z
    .number()
    .positive()
    .multipleOf(0.01, 'Amounts can have at most 2 decimal places')
    .max(5_000_000)
});

export const purchaseNumberSchema = z.object({
  country: z.string().min(2).max(40),
  operator: z.string().min(1).max(40),
  product: z.string().min(1).max(60)
});

export const inboundSmsWebhookSchema = z.object({
  toNumber: z.string().min(5),
  fromNumber: z.string().min(3),
  body: z.string().optional()
});

export const notifyPhoneSchema = z.object({
  notify_phone_number: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Use an international format like +15551234567')
    .or(z.literal(''))
});

/** Parses `body` against `schema`, returning a typed result or a 400-ready error string. */
export function parseOrError<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { success: true; data: T; error?: undefined } | { success: false; data?: undefined; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { success: true, data: result.data };
}