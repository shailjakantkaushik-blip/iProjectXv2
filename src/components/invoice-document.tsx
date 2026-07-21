import { forwardRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  calcInvoiceGst,
  fmtInvoiceMoney,
  normalizeLineItems,
  type InvoiceForRender,
  type InvoiceTemplateConfig,
} from "@/lib/invoice-template";

type Props = {
  invoice: InvoiceForRender;
  template: InvoiceTemplateConfig;
  /** Optional org display override */
  billToName?: string;
};

export const InvoiceDocument = forwardRef<HTMLDivElement, Props>(function InvoiceDocument(
  { invoice, template, billToName },
  ref,
) {
  const org = invoice.organizations;
  const customer = billToName || org?.brand_name || org?.name || "Customer";
  const lines = normalizeLineItems(invoice);
  const currency = invoice.currency ?? "USD";
  const gst = calcInvoiceGst(invoice.amount_cents, template);
  const primary = template.primary_color || "#0f1b3d";
  const accent = template.accent_color || "#3b6fa0";

  if (template.template_id === "compact") {
    return (
      <div
        ref={ref}
        className="mx-auto w-full max-w-[720px] bg-white p-8 text-[#0f172a]"
        style={{ fontFamily: "Manrope, system-ui, sans-serif" }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b pb-4"
          style={{ borderColor: "#e2e8f0" }}
        >
          <BrandBlock template={template} primary={primary} compact />
          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
              Invoice
            </div>
            <div className="mt-1 font-mono text-lg font-bold" style={{ color: primary }}>
              {invoice.invoice_number}
            </div>
            {template.show_status_badge && <StatusBadge status={invoice.status} />}
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Bill to
            </div>
            <div className="font-semibold">{customer}</div>
            {org?.billing_email && <div className="text-slate-600">{org.billing_email}</div>}
          </div>
          <MetaGrid invoice={invoice} template={template} />
        </div>
        {template.show_line_items && (
          <LineTable lines={lines} currency={currency} primary={primary} />
        )}
        <Totals gst={gst} currency={currency} primary={primary} />
        <NotesFooter invoice={invoice} template={template} />
      </div>
    );
  }

  if (template.template_id === "modern") {
    return (
      <div
        ref={ref}
        className="mx-auto w-full max-w-[800px] overflow-hidden bg-white text-[#0f172a]"
        style={{ fontFamily: "Manrope, system-ui, sans-serif" }}
      >
        <div
          className="px-10 py-8 text-white"
          style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
        >
          <div className="flex items-start justify-between gap-6">
            <BrandBlock template={template} primary="#ffffff" light />
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                Invoice
              </div>
              <div className="mt-1 font-mono text-2xl font-bold">{invoice.invoice_number}</div>
              {template.show_status_badge && (
                <div className="mt-2 inline-block rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold capitalize">
                  {invoice.status}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-10 py-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "#e2e8f0" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Bill to
              </div>
              <div className="mt-1 text-lg font-bold" style={{ color: primary }}>
                {customer}
              </div>
              {org?.billing_email && (
                <div className="text-sm text-slate-600">{org.billing_email}</div>
              )}
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "#e2e8f0" }}>
              <MetaGrid invoice={invoice} template={template} />
            </div>
          </div>
          {template.show_line_items && (
            <LineTable lines={lines} currency={currency} primary={primary} />
          )}
          <div className="mt-6 flex justify-end">
            <div
              className="min-w-[240px] rounded-xl px-5 py-4 text-white"
              style={{ background: primary }}
            >
              {gst.enabled && (
                <div className="mb-2 space-y-1 border-b border-white/20 pb-2 text-xs text-white/80">
                  <div className="flex justify-between gap-4">
                    <span>Subtotal</span>
                    <span>{fmtInvoiceMoney(gst.subtotal_cents, currency)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>
                      {gst.label} ({gst.percent}%)
                      {gst.inclusive ? " incl." : ""}
                    </span>
                    <span>{fmtInvoiceMoney(gst.gst_cents, currency)}</span>
                  </div>
                </div>
              )}
              <div className="text-xs uppercase tracking-wider text-white/70">Amount due</div>
              <div className="mt-1 text-3xl font-bold">
                {fmtInvoiceMoney(gst.total_cents, currency)}
              </div>
            </div>
          </div>
          <NotesFooter invoice={invoice} template={template} />
        </div>
      </div>
    );
  }

  // Standard template (default)
  return (
    <div
      ref={ref}
      className="mx-auto w-full max-w-[800px] bg-white p-10 text-[#0f172a]"
      style={{ fontFamily: "Manrope, system-ui, sans-serif" }}
    >
      <div
        className="flex items-start justify-between gap-6 border-b-2 pb-6"
        style={{ borderColor: primary }}
      >
        <BrandBlock template={template} primary={primary} />
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
            Invoice
          </div>
          <div className="mt-1 font-mono text-2xl font-bold" style={{ color: primary }}>
            {invoice.invoice_number}
          </div>
          {template.show_status_badge && <StatusBadge status={invoice.status} />}
        </div>
      </div>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Bill to
          </div>
          <div className="mt-1 text-base font-bold" style={{ color: primary }}>
            {customer}
          </div>
          {org?.billing_email && <div className="text-sm text-slate-600">{org.billing_email}</div>}
        </div>
        <MetaGrid invoice={invoice} template={template} />
      </div>

      {template.show_line_items && (
        <LineTable lines={lines} currency={currency} primary={primary} />
      )}
      <Totals gst={gst} currency={currency} primary={primary} />
      <NotesFooter invoice={invoice} template={template} />
    </div>
  );
});

function BrandBlock({
  template,
  primary,
  compact,
  light,
}: {
  template: InvoiceTemplateConfig;
  primary: string;
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {template.show_logo && template.logo_url ? (
        <img
          src={template.logo_url}
          alt={template.company_name}
          className={
            compact ? "h-10 max-w-[140px] object-contain" : "h-14 max-w-[180px] object-contain"
          }
        />
      ) : template.show_logo ? (
        <div
          className={`flex items-center justify-center rounded ${compact ? "h-10 w-10" : "h-12 w-12"}`}
          style={{ background: light ? "rgba(255,255,255,0.15)" : primary }}
        >
          <div className="h-5 w-5 rotate-45 border-2 border-white" />
        </div>
      ) : null}
      <div>
        <div
          className={`font-bold ${compact ? "text-base" : "text-xl"}`}
          style={{ color: light ? "#fff" : primary, fontFamily: "Sora, system-ui, sans-serif" }}
        >
          {template.company_name}
        </div>
        {template.company_tagline && (
          <div className={`text-xs ${light ? "text-white/80" : "text-slate-500"}`}>
            {template.company_tagline}
          </div>
        )}
        {template.show_company_address && (
          <div
            className={`mt-2 space-y-0.5 text-xs leading-relaxed ${light ? "text-white/75" : "text-slate-600"}`}
          >
            {template.company_address && (
              <div className="whitespace-pre-line">{template.company_address}</div>
            )}
            {template.company_email && <div>{template.company_email}</div>}
            {template.company_phone && <div>{template.company_phone}</div>}
            {template.company_website && <div>{template.company_website}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaGrid({
  invoice,
  template,
}: {
  invoice: InvoiceForRender;
  template: InvoiceTemplateConfig;
}) {
  const rows: [string, string][] = [
    ["Issue date", invoice.issue_date],
    ["Due date", invoice.due_date || "—"],
  ];
  if (template.show_billing_period) {
    rows.push([
      "Billing period",
      invoice.period_start && invoice.period_end
        ? `${invoice.period_start} → ${invoice.period_end}`
        : "—",
    ]);
  }
  if (invoice.paid_date) rows.push(["Paid date", invoice.paid_date]);
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 sm:justify-start sm:gap-6">
          <span className="min-w-[110px] text-slate-500">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function LineTable({
  lines,
  currency,
  primary,
}: {
  lines: { description: string; amount_cents: number }[];
  currency: string | null | undefined;
  primary: string;
}) {
  return (
    <table className="mt-8 w-full border-collapse text-sm">
      <thead>
        <tr style={{ background: `${primary}0d` }}>
          <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Description
          </th>
          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((li, i) => (
          <tr key={i} className="border-b" style={{ borderColor: "#e2e8f0" }}>
            <td className="px-3 py-3">{li.description}</td>
            <td className="px-3 py-3 text-right tabular-nums font-medium">
              {fmtInvoiceMoney(li.amount_cents, currency ?? "USD")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({
  gst,
  currency,
  primary,
}: {
  gst: ReturnType<typeof calcInvoiceGst>;
  currency: string;
  primary: string;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <div className="min-w-[240px] space-y-1.5 text-sm">
        {gst.enabled && (
          <>
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {fmtInvoiceMoney(gst.subtotal_cents, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>
                {gst.label} ({gst.percent}%)
                {gst.inclusive ? " included" : ""}
              </span>
              <span className="tabular-nums">{fmtInvoiceMoney(gst.gst_cents, currency)}</span>
            </div>
          </>
        )}
        <div
          className="flex items-center justify-between border-t-2 pt-3 font-bold"
          style={{ borderColor: primary }}
        >
          <span>Total due</span>
          <span className="text-lg tabular-nums" style={{ color: primary }}>
            {fmtInvoiceMoney(gst.total_cents, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function NotesFooter({
  invoice,
  template,
}: {
  invoice: InvoiceForRender;
  template: InvoiceTemplateConfig;
}) {
  return (
    <div
      className="mt-10 space-y-3 border-t pt-6 text-sm text-slate-600"
      style={{ borderColor: "#e2e8f0" }}
    >
      {template.show_notes && invoice.notes && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</div>
          <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}
      {template.show_payment_instructions && template.payment_instructions && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Payment instructions
          </div>
          <p className="mt-1 whitespace-pre-wrap">{template.payment_instructions}</p>
        </div>
      )}
      {template.thank_you_note && <p className="text-slate-500">{template.thank_you_note}</p>}
      {template.footer_text && <p className="text-xs text-slate-400">{template.footer_text}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    sent: "bg-blue-100 text-blue-800",
    overdue: "bg-red-100 text-red-800",
    draft: "bg-slate-100 text-slate-700",
    void: "bg-slate-100 text-slate-500",
  };
  return (
    <div
      className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-semibold capitalize ${colors[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status}
    </div>
  );
}

export async function downloadInvoicePdf(el: HTMLElement, invoiceNumber: string) {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(img, "PNG", (pageW - w) / 2, margin, w, h);
  pdf.save(`${invoiceNumber}.pdf`);
}
