import { useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import type { LandingConfig } from "@/lib/landing-config";

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" } as const;

type EoiFormState = {
  full_name: string;
  email: string;
  organization_name: string;
  phone: string;
  job_title: string;
  company_size: string;
  interest_areas: string;
  message: string;
};

const EMPTY: EoiFormState = {
  full_name: "",
  email: "",
  organization_name: "",
  phone: "",
  job_title: "",
  company_size: "",
  interest_areas: "",
  message: "",
};

/** Inline or card Expression of Interest form (landing + contact). */
export function EoiForm({
  cfg,
  source = "landing",
  onSuccess,
}: {
  cfg: LandingConfig;
  source?: string;
  onSuccess?: () => void;
}) {
  const p = cfg.palette;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<EoiFormState>(EMPTY);

  const set =
    (field: keyof EoiFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.email) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("eoi_requests").insert({ ...form, source });
      if (error) throw error;
      setSubmitted(true);
      onSuccess?.();
    } catch (err: any) {
      alert(err?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: `${p.success}18`, color: p.success }}
        >
          <Check className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold" style={{ ...HEADING, color: p.textHeading }}>
          Thank you for your interest
        </h3>
        <p className="max-w-md text-sm leading-relaxed" style={{ color: p.textMuted }}>
          We have received your expression of interest and will be in touch shortly.
        </p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: cfg.theme === "dark" ? p.navy : "#ffffff",
    borderColor: p.surface,
    color: p.textHeading,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-bold" style={{ ...HEADING, color: p.textHeading }}>
          Expression of Interest
        </h3>
        <p className="mt-1 text-sm" style={{ color: p.textMuted }}>
          Tell us about your organisation and how iProjectX can support your PMO.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="eoi-name" style={{ color: p.textBody }}>
            Full name <span style={{ color: p.danger }}>*</span>
          </Label>
          <input
            id="eoi-name"
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.full_name}
            onChange={set("full_name")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="eoi-email" style={{ color: p.textBody }}>
            Work email <span style={{ color: p.danger }}>*</span>
          </Label>
          <input
            id="eoi-email"
            type="email"
            required
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div>
          <Label htmlFor="eoi-org" style={{ color: p.textBody }}>
            Organisation
          </Label>
          <input
            id="eoi-org"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.organization_name}
            onChange={set("organization_name")}
          />
        </div>
        <div>
          <Label htmlFor="eoi-title" style={{ color: p.textBody }}>
            Job title
          </Label>
          <input
            id="eoi-title"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.job_title}
            onChange={set("job_title")}
          />
        </div>
        <div>
          <Label htmlFor="eoi-phone" style={{ color: p.textBody }}>
            Phone
          </Label>
          <input
            id="eoi-phone"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.phone}
            onChange={set("phone")}
          />
        </div>
        <div>
          <Label htmlFor="eoi-size" style={{ color: p.textBody }}>
            Company size
          </Label>
          <select
            id="eoi-size"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.company_size}
            onChange={set("company_size")}
          >
            <option value="">— Select —</option>
            <option value="1-50">1–50</option>
            <option value="51-200">51–200</option>
            <option value="201-1000">201–1,000</option>
            <option value="1000+">1,000+</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="eoi-interest" style={{ color: p.textBody }}>
            Areas of interest
          </Label>
          <input
            id="eoi-interest"
            placeholder="e.g. Portfolio governance, financials, stage gates"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.interest_areas}
            onChange={set("interest_areas")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="eoi-message" style={{ color: p.textBody }}>
            Message
          </Label>
          <textarea
            id="eoi-message"
            rows={3}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
            style={inputStyle}
            value={form.message}
            onChange={set("message")}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ ...HEADING, background: p.accent, color: p.textOnAccent }}
      >
        {submitting ? "Submitting…" : "Submit expression of interest"}
      </button>
    </form>
  );
}

export function EoiModal({ cfg, onClose }: { cfg: LandingConfig; onClose: () => void }) {
  const p = cfg.palette;

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdrop}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-8 shadow-2xl"
        style={{ background: cfg.theme === "dark" ? p.navyLight : "#ffffff" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md transition-opacity hover:opacity-60"
          style={{ color: p.textMuted }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <EoiForm cfg={cfg} source="landing" />
      </div>
    </div>
  );
}
