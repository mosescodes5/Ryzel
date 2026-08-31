import type { AppSettings } from "./config";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(
  settings: AppSettings,
  toEmail: string,
  subject: string,
  htmlContent: string,
  toName = ""
): Promise<void> {
  if (!settings.brevoApiKey) {
    console.log(`BREVO_API_KEY not set — skipping email to ${toEmail}: ${subject}`);
    return;
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": settings.brevoApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: settings.brevoSenderEmail, name: settings.brevoSenderName },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo send failed (${response.status}): ${await response.text()}`);
  }
}

/** send_email, but swallows and logs errors — use this at call sites so a
 * Brevo hiccup never fails the underlying order/payment/etc. */
export async function sendEmailSafe(
  settings: AppSettings,
  toEmail: string,
  subject: string,
  htmlContent: string,
  toName = ""
): Promise<void> {
  try {
    await sendEmail(settings, toEmail, subject, htmlContent, toName);
  } catch (e) {
    console.warn(`Email to ${toEmail} failed (subject=${subject}):`, e);
  }
}

function wrap(settings: AppSettings, bodyHtml: string): string {
  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <div style="font-weight: 700; font-size: 18px; margin-bottom: 20px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2CE6A6;margin-right:8px;"></span>
    ${settings.brevoSenderName}
  </div>
  ${bodyHtml}
  <p style="color:#8a8f98;font-size:12px;margin-top:32px;">
    This is an automated message from ${settings.brevoSenderName}. If you didn't expect this email, you can ignore it.
  </p>
</div>`;
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

function formatNgn(n: number): string {
  return Math.round(n).toLocaleString("en-NG");
}

export function orderReceiptEmail(
  settings: AppSettings,
  service: string,
  country: string,
  phoneNumber: string,
  smsCode: string,
  priceNgn: number
): { subject: string; html: string } {
  const subject = `Your ${titleCase(service)} number is ready — code: ${smsCode}`;
  const html = wrap(
    settings,
    `
        <p>Your number came through and the code arrived:</p>
        <div style="background:#f5f6f8;border-radius:10px;padding:16px;margin:16px 0;">
          <div style="font-size:12px;color:#8a8f98;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">SMS Code</div>
          <div style="font-family:monospace;font-size:24px;font-weight:700;letter-spacing:.05em;">${smsCode}</div>
        </div>
        <p style="font-size:14px;color:#4a4f57;">
          Service: <strong>${titleCase(service)}</strong><br/>
          Country: <strong>${titleCase(country)}</strong><br/>
          Number: <strong style="font-family:monospace;">${phoneNumber}</strong><br/>
          Charged: <strong>\u20a6${formatNgn(priceNgn)}</strong>
        </p>`
  );
  return { subject, html };
}

export function topupReceiptEmail(
  settings: AppSettings,
  amountNgn: number,
  newBalanceNgn: number
): { subject: string; html: string } {
  const subject = `Wallet funded — \u20a6${formatNgn(amountNgn)}`;
  const html = wrap(
    settings,
    `
        <p>Your wallet top-up went through.</p>
        <div style="background:#f5f6f8;border-radius:10px;padding:16px;margin:16px 0;">
          <div style="font-size:12px;color:#8a8f98;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Amount added</div>
          <div style="font-family:monospace;font-size:24px;font-weight:700;">\u20a6${formatNgn(amountNgn)}</div>
        </div>
        <p style="font-size:14px;color:#4a4f57;">New balance: <strong>\u20a6${formatNgn(newBalanceNgn)}</strong></p>`
  );
  return { subject, html };
}

export function lowBalanceEmail(settings: AppSettings, balanceNgn: number): { subject: string; html: string } {
  const subject = "Your wallet balance is running low";
  const html = wrap(
    settings,
    `<p>Your wallet balance is down to <strong>\u20a6${formatNgn(balanceNgn)}</strong> — top up to keep buying numbers without interruption.</p>`
  );
  return { subject, html };
}
