/**
 * Portable invoice email sender.
 *
 * Supports Resend / SendGrid via shared transactional-email helper.
 *
 * Common env vars:
 *   INVOICE_FROM_EMAIL   e.g. "billing@yourdomain.com"
 *   INVOICE_FROM_NAME    e.g. "iProjectX Billing"        (optional)
 *   INVOICE_REPLY_TO     e.g. "support@yourdomain.com"   (optional)
 *   RESEND_API_KEY | SENDGRID_API_KEY
 */

import { sendTransactionalEmail } from "@/lib/transactional-email.server";

type InvoiceGstBreakdown = {
  enabled: boolean;
  label: string;
  percent: number;
  inclusive: boolean;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  amount_cents: number;
  currency: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
};

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format((cents ?? 0) / 100);
}

function resolveGst(inv: InvoiceRow, gst?: InvoiceGstBreakdown): InvoiceGstBreakdown {
  if (gst) return gst;
  const amount = Math.max(0, Math.round(Number(inv.amount_cents) || 0));
  return {
    enabled: false,
    label: "GST",
    percent: 0,
    inclusive: false,
    subtotal_cents: amount,
    gst_cents: 0,
    total_cents: amount,
  };
}

function buildHtml(orgName: string, inv: InvoiceRow, gst: InvoiceGstBreakdown) {
  const currency = inv.currency ?? "USD";
  const total = fmtMoney(gst.total_cents, currency);
  const period =
    inv.period_start && inv.period_end
      ? `${inv.period_start} → ${inv.period_end}`
      : "—";
  const gstRows = gst.enabled
    ? `<tr><td style="padding:8px 0;color:#64748b">Subtotal</td><td style="padding:8px 0;text-align:right">${fmtMoney(gst.subtotal_cents, currency)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">${gst.label} (${gst.percent}%)${gst.inclusive ? " incl." : ""}</td><td style="padding:8px 0;text-align:right">${fmtMoney(gst.gst_cents, currency)}</td></tr>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="padding:24px 28px;border-bottom:1px solid #eef1f5">
      <div style="font-size:12px;letter-spacing:.08em;color:#64748b;text-transform:uppercase">Invoice</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${inv.invoice_number}</div>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 12px">Hi ${orgName},</p>
      <p style="margin:0 0 16px">Your invoice is now available. Summary below:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${gstRows}
        <tr><td style="padding:8px 0;color:#64748b">Amount due</td><td style="padding:8px 0;text-align:right;font-weight:700">${total}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Issue date</td><td style="padding:8px 0;text-align:right">${inv.issue_date}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Due date</td><td style="padding:8px 0;text-align:right">${inv.due_date ?? "—"}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Billing period</td><td style="padding:8px 0;text-align:right">${period}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Status</td><td style="padding:8px 0;text-align:right;text-transform:capitalize">${inv.status}</td></tr>
      </table>
      ${inv.notes ? `<p style="margin:16px 0 0;color:#334155;font-size:13px">${inv.notes}</p>` : ""}
      <p style="margin:24px 0 0;font-size:12px;color:#64748b">Please arrange payment before the due date. Reply to this email if you have any questions.</p>
    </div>
  </div>
</body></html>`;
}

function buildText(orgName: string, inv: InvoiceRow, gst: InvoiceGstBreakdown) {
  const currency = inv.currency ?? "USD";
  const lines = [
    `Hi ${orgName},`,
    ``,
    `Invoice ${inv.invoice_number}`,
  ];
  if (gst.enabled) {
    lines.push(`Subtotal: ${fmtMoney(gst.subtotal_cents, currency)}`);
    lines.push(
      `${gst.label} (${gst.percent}%)${gst.inclusive ? " incl." : ""}: ${fmtMoney(gst.gst_cents, currency)}`,
    );
  }
  lines.push(
    `Amount due: ${fmtMoney(gst.total_cents, currency)}`,
    `Issue date: ${inv.issue_date}`,
    `Due date: ${inv.due_date ?? "—"}`,
    inv.period_start && inv.period_end
      ? `Billing period: ${inv.period_start} → ${inv.period_end}`
      : "",
    `Status: ${inv.status}`,
    inv.notes ? `\n${inv.notes}` : "",
  );
  return lines.filter(Boolean).join("\n");
}

export async function sendInvoiceEmailRaw(args: {
  to: string;
  orgName: string;
  invoice: InvoiceRow;
  gst?: InvoiceGstBreakdown;
}) {
  const { to, orgName, invoice } = args;
  const gst = resolveGst(invoice, args.gst);
  if (!process.env.INVOICE_FROM_EMAIL && !process.env.ALERTS_FROM_EMAIL) {
    throw new Error("INVOICE_FROM_EMAIL is not configured");
  }

  const subject = `Invoice ${invoice.invoice_number} — ${fmtMoney(
    gst.total_cents,
    invoice.currency ?? "USD",
  )} due ${invoice.due_date ?? ""}`.trim();

  await sendTransactionalEmail({
    to,
    subject,
    html: buildHtml(orgName, invoice, gst),
    text: buildText(orgName, invoice, gst),
    fromName: process.env.INVOICE_FROM_NAME || "Billing",
  });
}
