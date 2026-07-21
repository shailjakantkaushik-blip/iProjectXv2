import { supabase } from "@/integrations/supabase/client";

export type InvoiceTemplateId = "standard" | "compact" | "modern";

export type InvoiceTemplateConfig = {
  template_id: InvoiceTemplateId;
  company_name: string;
  company_tagline: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  company_website: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  show_logo: boolean;
  show_company_address: boolean;
  show_billing_period: boolean;
  show_notes: boolean;
  show_payment_instructions: boolean;
  show_line_items: boolean;
  show_status_badge: boolean;
  /** When true, GST line is shown on invoices and listings */
  gst_enabled: boolean;
  /** GST / tax percentage, e.g. 18 for 18% */
  gst_percent: number;
  /** Label printed on invoices, e.g. "GST" or "VAT" */
  gst_label: string;
  /**
   * If false (default): invoice amount_cents is taxable (ex-GST); GST is added for total due.
   * If true: amount_cents already includes GST; breakdown is derived.
   */
  gst_inclusive: boolean;
  footer_text: string;
  payment_instructions: string;
  thank_you_note: string;
};

export type InvoiceGstBreakdown = {
  enabled: boolean;
  label: string;
  percent: number;
  inclusive: boolean;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
};

export type InvoiceTemplatePreset = {
  id: InvoiceTemplateId;
  name: string;
  description: string;
};

export const INVOICE_TEMPLATE_PRESETS: InvoiceTemplatePreset[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Classic invoice with logo header, bill-to block, and totals table.",
  },
  {
    id: "compact",
    name: "Compact",
    description: "Space-efficient single-column layout for shorter invoices.",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Bold accent band with clean typography and card-style totals.",
  },
];

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = {
  template_id: "standard",
  company_name: "iProjectX",
  company_tagline: "Enterprise PMO Command Center",
  company_address: "",
  company_email: "billing@iprojectx.com",
  company_phone: "",
  company_website: "",
  logo_url: "",
  primary_color: "#0f1b3d",
  accent_color: "#3b6fa0",
  show_logo: true,
  show_company_address: true,
  show_billing_period: true,
  show_notes: true,
  show_payment_instructions: true,
  show_line_items: true,
  show_status_badge: true,
  gst_enabled: true,
  gst_percent: 18,
  gst_label: "GST",
  gst_inclusive: false,
  footer_text: "Thank you for your business.",
  payment_instructions:
    "Please arrange payment by the due date. Reference the invoice number on your remittance.",
  thank_you_note: "Questions about this invoice? Reply to the billing email and we will help.",
};

export function mergeInvoiceTemplate(partial: any): InvoiceTemplateConfig {
  const merged = {
    ...DEFAULT_INVOICE_TEMPLATE,
    ...(partial && typeof partial === "object" ? partial : {}),
  };
  if (!INVOICE_TEMPLATE_PRESETS.some((p) => p.id === merged.template_id)) {
    merged.template_id = "standard";
  }
  const pct = Number(merged.gst_percent);
  merged.gst_percent = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 18;
  merged.gst_enabled = Boolean(merged.gst_enabled);
  merged.gst_inclusive = Boolean(merged.gst_inclusive);
  merged.gst_label = String(merged.gst_label || "GST").trim() || "GST";
  return merged as InvoiceTemplateConfig;
}

/** Compute subtotal / GST / total from stored invoice amount_cents + template GST settings. */
export function calcInvoiceGst(
  amountCents: number,
  template: Pick<
    InvoiceTemplateConfig,
    "gst_enabled" | "gst_percent" | "gst_label" | "gst_inclusive"
  >,
): InvoiceGstBreakdown {
  const amount = Math.max(0, Math.round(Number(amountCents) || 0));
  const percent = Number(template.gst_percent) || 0;
  const label = template.gst_label || "GST";
  const inclusive = Boolean(template.gst_inclusive);

  if (!template.gst_enabled || percent <= 0) {
    return {
      enabled: false,
      label,
      percent: 0,
      inclusive,
      subtotal_cents: amount,
      gst_cents: 0,
      total_cents: amount,
    };
  }

  if (inclusive) {
    const total = amount;
    const subtotal = Math.round(total / (1 + percent / 100));
    return {
      enabled: true,
      label,
      percent,
      inclusive: true,
      subtotal_cents: subtotal,
      gst_cents: total - subtotal,
      total_cents: total,
    };
  }

  const subtotal = amount;
  const gst = Math.round((subtotal * percent) / 100);
  return {
    enabled: true,
    label,
    percent,
    inclusive: false,
    subtotal_cents: subtotal,
    gst_cents: gst,
    total_cents: subtotal + gst,
  };
}

export async function fetchInvoiceTemplate(): Promise<InvoiceTemplateConfig> {
  const { data } = await supabase
    .from("invoice_template_config" as any)
    .select("config")
    .eq("id", "singleton")
    .maybeSingle();
  return mergeInvoiceTemplate((data as any)?.config);
}

export async function saveInvoiceTemplate(config: InvoiceTemplateConfig, userId?: string) {
  const { error } = await supabase
    .from("invoice_template_config" as any)
    .upsert({ id: "singleton", config: config as any, updated_by: userId ?? null });
  if (error) throw error;
}

export type InvoiceForRender = {
  id: string;
  invoice_number: string;
  amount_cents: number;
  currency: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  paid_date?: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  line_items?: any;
  organizations?: {
    name?: string | null;
    brand_name?: string | null;
    billing_email?: string | null;
  } | null;
};

export function fmtInvoiceMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format((cents ?? 0) / 100);
}

export function normalizeLineItems(
  inv: InvoiceForRender,
): { description: string; amount_cents: number }[] {
  const raw = inv.line_items;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((li: any) => ({
      description: String(li?.description ?? li?.name ?? "Line item"),
      amount_cents: Number(li?.amount_cents ?? li?.amount ?? 0),
    }));
  }
  const period =
    inv.period_start && inv.period_end
      ? `Subscription · ${inv.period_start} → ${inv.period_end}`
      : "Subscription / services";
  return [{ description: period, amount_cents: inv.amount_cents }];
}
