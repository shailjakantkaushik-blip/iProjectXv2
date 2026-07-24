import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, RefreshCw, Save, Upload, Trash2 } from "lucide-react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { InvoiceDocument } from "@/components/invoice-document";
import { PageLoading } from "@/components/page-loading";
import {
  DEFAULT_INVOICE_TEMPLATE,
  INVOICE_TEMPLATE_PRESETS,
  fetchInvoiceTemplate,
  newInvoiceTemplateField,
  saveInvoiceTemplate,
  type InvoiceTemplateConfig,
  type InvoiceTemplateId,
  type InvoiceTemplateSection,
  type InvoiceTemplateSectionId,
} from "@/lib/invoice-template";

export const Route = createFileRoute("/_authenticated/platform/invoice-template")({
  component: InvoiceTemplatePage,
});

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const SAMPLE_INVOICE = {
  id: "preview",
  invoice_number: "INV-PREVIEW",
  amount_cents: 249900,
  currency: "USD",
  status: "sent",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  notes: "Enterprise plan — monthly subscription.",
  line_items: [{ description: "Enterprise plan · Jul 2026", amount_cents: 249900 }],
  organizations: {
    name: "Acme Portfolio Co",
    brand_name: "Acme Portfolio",
    billing_email: "billing@acme.example",
  },
};

function InvoiceTemplatePage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<InvoiceTemplateConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    setCfg(await fetchInvoiceTemplate());
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveInvoiceTemplate(cfg, user?.id);
      toast.success("Invoice template saved. New invoices will use this format.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset the invoice template to platform defaults?")) return;
    setCfg(structuredClone(DEFAULT_INVOICE_TEMPLATE));
  }

  const handleLogoPick = (file: File) => {
    if (!cfg) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCfg({ ...cfg, logo_url: reader.result as string });
    reader.readAsDataURL(file);
  };

  if (!cfg) {
    return <PageLoading label="Loading invoice template…" fullScreen={false} />;
  }

  const patch = (p: Partial<InvoiceTemplateConfig>) => setCfg({ ...cfg, ...p });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Invoice Template"
          subtitle="Configure the standard invoice layout used for preview, PDF download, and billing documents across the platform."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reset defaults
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <SectionFrame>
            <SectionTitle>Standard templates</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a layout, then customise company details, logo, colours and visible elements.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {INVOICE_TEMPLATE_PRESETS.map((preset) => {
                const active = cfg.template_id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => patch({ template_id: preset.id as InvoiceTemplateId })}
                    className={`rounded-lg border p-3 text-left transition hover:border-primary ${active ? "border-primary ring-2 ring-primary/20" : ""}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" /> {preset.name}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Company & logo</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Company name">
                <Input
                  value={cfg.company_name}
                  onChange={(e) => patch({ company_name: e.target.value })}
                />
              </Field>
              <Field label="Tagline">
                <Input
                  value={cfg.company_tagline}
                  onChange={(e) => patch({ company_tagline: e.target.value })}
                />
              </Field>
              <Field label="Billing email">
                <Input
                  value={cfg.company_email}
                  onChange={(e) => patch({ company_email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={cfg.company_phone}
                  onChange={(e) => patch({ company_phone: e.target.value })}
                />
              </Field>
              <Field label="Website">
                <Input
                  value={cfg.company_website}
                  onChange={(e) => patch({ company_website: e.target.value })}
                />
              </Field>
              <Field label="Address" className="md:col-span-2">
                <Textarea
                  rows={3}
                  value={cfg.company_address}
                  onChange={(e) => patch({ company_address: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Label className="text-xs font-semibold uppercase tracking-wide">Logo</Label>
              <div className="mt-2 flex items-center gap-4 rounded-lg border p-4">
                <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded border bg-muted">
                  {cfg.logo_url ? (
                    <img
                      src={cfg.logo_url}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="px-2 text-center text-xs text-muted-foreground">No logo</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoPick(f);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" /> Upload logo
                    </Button>
                    {cfg.logo_url && (
                      <Button variant="ghost" size="sm" onClick={() => patch({ logo_url: "" })}>
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG / JPG / SVG / WebP · max 5 MB. Shown on every generated invoice.
                  </p>
                  <Field label="Or paste logo URL">
                    <Input
                      value={cfg.logo_url.startsWith("data:") ? "" : cfg.logo_url}
                      placeholder="https://cdn.example.com/logo.svg"
                      onChange={(e) => patch({ logo_url: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Colours</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Primary">
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={cfg.primary_color}
                    className="h-10 w-14 p-1"
                    onChange={(e) => patch({ primary_color: e.target.value })}
                  />
                  <Input
                    value={cfg.primary_color}
                    onChange={(e) => patch({ primary_color: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Accent">
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={cfg.accent_color}
                    className="h-10 w-14 p-1"
                    onChange={(e) => patch({ accent_color: e.target.value })}
                  />
                  <Input
                    value={cfg.accent_color}
                    onChange={(e) => patch({ accent_color: e.target.value })}
                  />
                </div>
              </Field>
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>GST / tax</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Applied on every invoice preview, PDF, listing total, and customer billing view.
            </p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                <span>Enable GST on invoices</span>
                <Switch
                  checked={cfg.gst_enabled}
                  onCheckedChange={(v) => patch({ gst_enabled: v })}
                />
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="GST percentage">
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      disabled={!cfg.gst_enabled}
                      value={cfg.gst_percent}
                      onChange={(e) =>
                        patch({ gst_percent: Number(e.target.value) })
                      }
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
                <Field label="Tax label">
                  <Input
                    disabled={!cfg.gst_enabled}
                    value={cfg.gst_label}
                    placeholder="GST"
                    onChange={(e) => patch({ gst_label: e.target.value })}
                  />
                </Field>
                <div className="flex items-end">
                  <label className="flex w-full items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                    <span className="leading-tight">
                      Amount includes GST
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Off = amount is exclusive; GST added
                      </span>
                    </span>
                    <Switch
                      checked={cfg.gst_inclusive}
                      disabled={!cfg.gst_enabled}
                      onCheckedChange={(v) => patch({ gst_inclusive: v })}
                    />
                  </label>
                </div>
              </div>
              {cfg.gst_enabled && (
                <p className="text-xs text-muted-foreground">
                  Preview sample: taxable{" "}
                  <span className="font-medium text-foreground">$2,499.00</span>
                  {" → "}
                  {cfg.gst_label} {cfg.gst_percent}%
                  {cfg.gst_inclusive ? " (included)" : " added"}
                  {" → total due updates live on the right."}
                </p>
              )}
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Layout elements</SectionTitle>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["show_logo", "Show logo"],
                  ["show_company_address", "Show company address block"],
                  ["show_billing_period", "Show billing period"],
                  ["show_line_items", "Show line items table"],
                  ["show_notes", "Show invoice notes"],
                  ["show_payment_instructions", "Show payment instructions"],
                  ["show_status_badge", "Show status badge"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                >
                  <span>{label}</span>
                  <Switch checked={cfg[key]} onCheckedChange={(v) => patch({ [key]: v })} />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="Payment instructions">
                <Textarea
                  rows={3}
                  value={cfg.payment_instructions}
                  onChange={(e) => patch({ payment_instructions: e.target.value })}
                />
              </Field>
              <Field label="Thank-you note">
                <Textarea
                  rows={2}
                  value={cfg.thank_you_note}
                  onChange={(e) => patch({ thank_you_note: e.target.value })}
                />
              </Field>
              <Field label="Footer text">
                <Input
                  value={cfg.footer_text}
                  onChange={(e) => patch({ footer_text: e.target.value })}
                />
              </Field>
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Section fields</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Add custom label/value fields to any invoice region (tax IDs, bank details, PO
              numbers, compliance lines, etc.). Saved on the template for future invoice layouts.
            </p>
            <div className="mt-4 space-y-4">
              {(cfg.sections ?? []).map((section) => (
                <SectionFieldsEditor
                  key={section.id}
                  section={section}
                  onChange={(next) =>
                    patch({
                      sections: (cfg.sections ?? []).map((s) =>
                        s.id === section.id ? next : s,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </SectionFrame>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <SectionFrame>
            <SectionTitle>Live preview</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Sample invoice rendered with the current template.
            </p>
            <div className="mt-4 overflow-auto rounded-lg border bg-slate-100 p-4">
              <InvoiceDocument invoice={SAMPLE_INVOICE as any} template={cfg} />
            </div>
          </SectionFrame>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SectionFieldsEditor({
  section,
  onChange,
}: {
  section: InvoiceTemplateSection;
  onChange: (next: InvoiceTemplateSection) => void;
}) {
  const patchField = (fieldId: string, patch: Partial<(typeof section.fields)[number]>) => {
    onChange({
      ...section,
      fields: section.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
    });
  };

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{section.title}</div>
          <div className="text-[11px] text-muted-foreground">
            Region: <code className="text-[10px]">{section.id as InvoiceTemplateSectionId}</code>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Show section</span>
          <Switch
            checked={section.visible}
            onCheckedChange={(visible) => onChange({ ...section, visible })}
          />
        </label>
      </div>

      {section.visible ? (
        <div className="mt-3 space-y-2">
          {section.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom fields yet.</p>
          ) : (
            section.fields.map((field) => (
              <div
                key={field.id}
                className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_1.4fr_auto_auto]"
              >
                <Input
                  placeholder="Label"
                  value={field.label}
                  onChange={(e) => patchField(field.id, { label: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Value / data"
                  value={field.value}
                  onChange={(e) => patchField(field.id, { value: e.target.value })}
                  className="h-8 text-xs"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Switch
                    checked={field.visible}
                    onCheckedChange={(visible) => patchField(field.id, { visible })}
                  />
                  On
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() =>
                    onChange({
                      ...section,
                      fields: section.fields.filter((f) => f.id !== field.id),
                    })
                  }
                  aria-label="Remove field"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              onChange({
                ...section,
                fields: [...section.fields, newInvoiceTemplateField({ label: "", value: "" })],
              })
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add field
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Section hidden on invoices.</p>
      )}
    </div>
  );
}
