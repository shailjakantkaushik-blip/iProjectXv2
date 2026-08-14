/**
 * Portable transactional email (Resend or SendGrid via fetch).
 * Shared by invoices and outbound alert digests.
 *
 * Env:
 *   RESEND_API_KEY | SENDGRID_API_KEY
 *   INVOICE_FROM_EMAIL (also used as alerts from unless ALERTS_FROM_EMAIL set)
 *   INVOICE_FROM_NAME / ALERTS_FROM_NAME
 *   INVOICE_REPLY_TO (optional)
 */

export type TransactionalEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
};

export function resolveAlertsFromEmail(): string {
  const from = process.env.ALERTS_FROM_EMAIL || process.env.INVOICE_FROM_EMAIL;
  if (!from) throw new Error("INVOICE_FROM_EMAIL (or ALERTS_FROM_EMAIL) is not configured");
  return from;
}

export async function sendTransactionalEmail(args: TransactionalEmailPayload) {
  const from = resolveAlertsFromEmail();
  const fromName =
    args.fromName ||
    process.env.ALERTS_FROM_NAME ||
    process.env.INVOICE_FROM_NAME ||
    "iProjectX";
  const replyTo = process.env.INVOICE_REPLY_TO;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${from}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend ${res.status}: ${body}`);
    }
    return;
  }

  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: from, name: fromName },
        reply_to: replyTo ? { email: replyTo } : undefined,
        subject: args.subject,
        content: [
          { type: "text/plain", value: args.text },
          { type: "text/html", value: args.html },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SendGrid ${res.status}: ${body}`);
    }
    return;
  }

  throw new Error(
    "No email provider configured. Set RESEND_API_KEY or SENDGRID_API_KEY.",
  );
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
