const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

type SendSmsParams = {
  to: string; // E.164, e.g. +15551234567
  content: string;
};

/**
 * Sends one transactional SMS via Brevo. Used to notify a customer the
 * instant their rented number receives a verification code, so they
 * don't have to keep the dashboard open and polling.
 *
 * Fails soft: a Brevo error is logged, not thrown, so a notification
 * hiccup never blocks recording the SMS code itself (the code is always
 * saved to the DB regardless of whether the notification goes out).
 */
export async function sendSms({ to, content }: SendSmsParams): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_NAME || process.env.BREVO_SMS_SENDER;

  if (!apiKey || !sender) {
    console.error('Brevo SMS not configured (BREVO_API_KEY / BREVO_SENDER_NAME missing)');
    return { ok: false, error: 'not_configured' };
  }

  try {
    const res = await fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender,
        recipient: to,
        content,
        type: 'transactional'
      })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Brevo SMS send failed (${res.status}): ${body}`);
      return { ok: false, error: `brevo_${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error('Brevo SMS send threw', err);
    return { ok: false, error: 'network_error' };
  }
}

export function buildCodeReceivedMessage(params: { phoneNumber: string; product: string; code: string | null; text: string | null }) {
  const codePart = params.code ? `Code: ${params.code}` : params.text?.slice(0, 120) ?? 'New message received';
  return `RYZEL: ${params.product} SMS on ${params.phoneNumber}. ${codePart}`;
}
