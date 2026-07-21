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
  footer_text: string;
  payment_instructions: string;
  thank_you_note: string;
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
  return merged as InvoiceTemplateConfig;
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
