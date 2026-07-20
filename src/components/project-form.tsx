import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export interface ProjectFormValues {
  project_code?: string | null;
  name: string;
  program?: string | null;
  sponsor?: string | null;
  bu_id?: string | null;
  priority?: string;
  status?: string;
  rag?: string;
  current_phase?: string | null;
  delivery_method?: string;
  start_date?: string | null;
  end_date?: string | null;
  target_go_live?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  budget?: number;
  capex_approved?: number;
  capex_incurred?: number;
  opex_approved?: number;
  opex_incurred?: number;
  benefits_target?: number;
  benefits_realised?: number;
  roi_percent?: number;
  description?: string | null;
  // Project brief (stored in projects.brief JSONB)
  business_owner_name?: string;
  business_owner_role?: string;
  business_owner_email?: string;
  solution_manager_name?: string;
  solution_manager_role?: string;
  solution_manager_email?: string;
  business_case_url?: string;
  charter_url?: string;
  status_report_url?: string;
  problem_statement?: string;
  proposed_solution?: string;
  success_criteria?: string;
  scope_in?: string;
  scope_out?: string;
  assumptions?: string;
  constraints?: string;
}

const OPTS = {
  priority: ["Low", "Medium", "High", "Critical"],
  status: ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"],
  rag: ["Green", "Amber", "Red"],
  delivery: ["Waterfall", "Agile", "Hybrid"],
};

const BRIEF_KEYS = [
  "business_owner_name","business_owner_role","business_owner_email",
  "solution_manager_name","solution_manager_role","solution_manager_email",
  "business_case_url","charter_url","status_report_url",
  "problem_statement","proposed_solution","success_criteria",
  "scope_in","scope_out","assumptions","constraints",
] as const;

function toDateInput(v: string | null | undefined) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

export function ProjectForm({
  defaultValues,
  onSubmit,
  busy,
  submitLabel,
}: {
  defaultValues?: Partial<ProjectFormValues> & { brief?: Record<string, unknown> };
  onSubmit: (v: ProjectFormValues & { brief?: Record<string, unknown> }) => void | Promise<void>;
  busy?: boolean;
  submitLabel: string;
}) {
  const { organization } = useAuth();
  const { data: bus = [] } = useQuery({
    queryKey: ["bus", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_units").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const briefDefaults: Record<string, string> = {};
  if (defaultValues?.brief && typeof defaultValues.brief === "object") {
    for (const k of BRIEF_KEYS) briefDefaults[k] = String((defaultValues.brief as any)[k] ?? "");
  }

  const { register, handleSubmit } = useForm<ProjectFormValues>({
    defaultValues: {
      priority: "Medium", status: "Not Started", rag: "Green", delivery_method: "Waterfall",
      ...defaultValues,
      ...briefDefaults,
      start_date: toDateInput(defaultValues?.start_date),
      end_date: toDateInput(defaultValues?.end_date),
      target_go_live: toDateInput(defaultValues?.target_go_live),
      planned_start_date: toDateInput(defaultValues?.planned_start_date),
      planned_end_date: toDateInput(defaultValues?.planned_end_date),
      actual_start_date: toDateInput(defaultValues?.actual_start_date),
      actual_end_date: toDateInput(defaultValues?.actual_end_date),
    },
  });

  const submit = handleSubmit(async (v) => {
    const clean: any = { ...v };
    for (const k of ["start_date","end_date","target_go_live","planned_start_date","planned_end_date","actual_start_date","actual_end_date"]) {
      if (!clean[k]) clean[k] = null;
    }
    for (const k of ["budget","capex_approved","capex_incurred","opex_approved","opex_incurred","benefits_target","benefits_realised","roi_percent"]) {
      const val = clean[k];
      clean[k] = val === undefined || val === null || val === "" ? 0 : Number(val);
    }
    if (clean.bu_id === "" || clean.bu_id === "none") clean.bu_id = null;
    // Collect brief fields into a JSONB payload and strip them from top-level.
    const brief: Record<string, unknown> = { ...(defaultValues?.brief ?? {}) };
    for (const k of BRIEF_KEYS) {
      if (clean[k] != null && clean[k] !== "") brief[k] = clean[k];
      delete clean[k];
    }
    clean.brief = brief;
    await onSubmit(clean);
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-8">
          <Section title="1 · Project Basics">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Project code *"><Input {...register("project_code", { required: true })} placeholder="PRJ-001" /></Field>
              <Field label="Name *"><Input {...register("name", { required: true })} /></Field>
              <Field label="Program"><Input {...register("program")} placeholder="Growth / Transformation…" /></Field>
              <Field label="Business Unit">
                <select {...register("bu_id")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="none">— None —</option>
                  {bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Sponsor"><Input {...register("sponsor")} /></Field>
              <Field label="Current Phase"><Input {...register("current_phase")} placeholder="Discovery / Design / Build…" /></Field>
            </div>
          </Section>

          <Section title="2 · Delivery & Status">
            <div className="grid gap-4 md:grid-cols-4">
              <Sel label="Delivery Method" reg={register("delivery_method")} opts={OPTS.delivery} />
              <Sel label="Priority" reg={register("priority")} opts={OPTS.priority} />
              <Sel label="Status" reg={register("status")} opts={OPTS.status} />
              <Sel label="RAG" reg={register("rag")} opts={OPTS.rag} />
            </div>
          </Section>

          <Section title="3 · Dates (Planned vs Actual)">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Start Date"><Input type="date" {...register("start_date")} /></Field>
              <Field label="End Date"><Input type="date" {...register("end_date")} /></Field>
              <Field label="Target Go-Live"><Input type="date" {...register("target_go_live")} /></Field>
              <Field label="Planned Start"><Input type="date" {...register("planned_start_date")} /></Field>
              <Field label="Planned End"><Input type="date" {...register("planned_end_date")} /></Field>
              <div />
              <Field label="Actual Start"><Input type="date" {...register("actual_start_date")} /></Field>
              <Field label="Actual End"><Input type="date" {...register("actual_end_date")} /></Field>
            </div>
          </Section>

          <Section title="4 · Financials">
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Total Budget"><Input type="number" step="0.01" {...register("budget")} /></Field>
              <Field label="CAPEX Approved"><Input type="number" step="0.01" {...register("capex_approved")} /></Field>
              <Field label="CAPEX Incurred"><Input type="number" step="0.01" {...register("capex_incurred")} /></Field>
              <Field label="OPEX Approved"><Input type="number" step="0.01" {...register("opex_approved")} /></Field>
              <Field label="OPEX Incurred"><Input type="number" step="0.01" {...register("opex_incurred")} /></Field>
              <Field label="Benefits Target"><Input type="number" step="0.01" {...register("benefits_target")} /></Field>
              <Field label="Benefits Realised"><Input type="number" step="0.01" {...register("benefits_realised")} /></Field>
              <Field label="ROI %"><Input type="number" step="0.01" {...register("roi_percent")} /></Field>
            </div>
          </Section>

          <Section title="5 · Project Brief — Business Owner">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Name"><Input {...register("business_owner_name")} /></Field>
              <Field label="Role"><Input {...register("business_owner_role")} /></Field>
              <Field label="Email"><Input type="email" {...register("business_owner_email")} /></Field>
            </div>
          </Section>

          <Section title="6 · Project Brief — Solution Manager">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Name"><Input {...register("solution_manager_name")} /></Field>
              <Field label="Role"><Input {...register("solution_manager_role")} /></Field>
              <Field label="Email"><Input type="email" {...register("solution_manager_email")} /></Field>
            </div>
          </Section>

          <Section title="7 · Project Brief — Narrative">
            <div className="grid gap-4">
              <Field label="Problem Statement"><Textarea rows={3} {...register("problem_statement")} /></Field>
              <Field label="Proposed Solution"><Textarea rows={3} {...register("proposed_solution")} /></Field>
              <Field label="Success Criteria"><Textarea rows={2} {...register("success_criteria")} /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="In Scope"><Textarea rows={3} {...register("scope_in")} /></Field>
                <Field label="Out of Scope"><Textarea rows={3} {...register("scope_out")} /></Field>
                <Field label="Assumptions"><Textarea rows={3} {...register("assumptions")} /></Field>
                <Field label="Constraints"><Textarea rows={3} {...register("constraints")} /></Field>
              </div>
            </div>
          </Section>

          <Section title="8 · Document Links">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Business Case URL"><Input {...register("business_case_url")} placeholder="https://…" /></Field>
              <Field label="Project Charter URL"><Input {...register("charter_url")} placeholder="https://…" /></Field>
              <Field label="Latest Status Report URL"><Input {...register("status_report_url")} placeholder="https://…" /></Field>
            </div>
          </Section>

          <Section title="9 · Description">
            <Field label="Short description"><Textarea rows={4} {...register("description")} /></Field>
          </Section>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy} size="lg">{busy ? "Saving…" : submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Sel({ label, reg, opts }: { label: string; reg: ReturnType<ReturnType<typeof useForm>["register"]>; opts: string[] }) {
  return (
    <Field label={label}>
      <select {...reg} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}
