import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { HelpCircle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { syncScheduleDates } from "@/lib/project-dates";
import { SectionFrame } from "@/components/streamlit";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FIELD_HELP,
  PORTFOLIO_OPTS,
  PRIORITY_OPTS,
  RAG_OPTS,
  STATUS_OPTS,
  WIZARD_STEPS,
} from "@/lib/project-wizard";
import {
  deliveryMethodsQueryKey,
  fetchDeliveryMethods,
  findDeliveryMethod,
  methodUsesStageGates,
} from "@/lib/delivery-methods";

const FIELD_LABELS: Record<string, string> = {
  project_code: "Project code",
  name: "Name",
  portfolio: "Strategic Alignment",
  program: "Program",
  sponsor: "Sponsor",
  bu_id: "Business unit",
  priority: "Priority",
  status: "Status",
  rag: "RAG",
  delivery_method: "Delivery method",
  current_phase: "Current phase",
  planned_start_date: "Planned start",
  planned_end_date: "Planned end",
  actual_start_date: "Actual start",
  actual_end_date: "Actual end",
  target_go_live: "Target go-live",
  budget: "Budget",
  capex_approved: "CAPEX approved",
  opex_approved: "OPEX approved",
  capex_incurred: "CAPEX incurred",
  opex_incurred: "OPEX incurred",
  benefits_target: "Benefits target",
  benefits_realised: "Benefits realised",
  roi_percent: "ROI %",
  description: "Description",
  stream_name: "Stream name",
  stream_code: "Stream code",
  fy: "FY",
  fy_budget: "Budget $",
  fy_forecast: "Forecast $",
  fy_capex: "CAPEX",
  fy_opex: "OPEX",
  wi_title: "Title",
  wi_wbs: "WBS",
  wi_hours: "Planned hours",
  wi_gate: "Stage gate",
  risk_title: "Risk title",
  stakeholder_name: "Stakeholder name",
  stakeholder_role: "Role",
};

function HelpHeading({
  title,
  help,
  as = "h2",
}: {
  title: string;
  help: string;
  as?: "h2" | "h3" | "label";
}) {
  const Tag = as === "label" ? "label" : as;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Tag
          className={
            as === "label"
              ? "inline-flex cursor-help items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              : as === "h3"
                ? "inline-flex cursor-help items-center gap-1.5 text-sm font-semibold"
                : "inline-flex cursor-help items-center gap-1.5 text-base font-semibold"
          }
          title={help}
        >
          {title}
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden />
        </Tag>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
        {help}
      </TooltipContent>
    </Tooltip>
  );
}

function Field({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const help = FIELD_HELP[id] || "";
  return (
    <div className={className}>
      <HelpHeading
        as="label"
        title={FIELD_LABELS[id] || id}
        help={help || `Field: ${id}`}
      />
      <div className="mt-1">{children}</div>
    </div>
  );
}

type ExtraStream = { name: string; code: string };
type GatePlan = { gate_name: string; planned_date: string; include: boolean };
type FyRow = { fy: string; budget: string; forecast: string; capex: string; opex: string };
type WiRow = { title: string; wbs_code: string; estimate_hours: string; stage_gate_name: string };

const emptyProject = {
  project_code: "",
  name: "",
  portfolio: "Business Strategic",
  program: "",
  sponsor: "",
  bu_id: "",
  priority: "Medium",
  status: "Not Started",
  rag: "Green",
  delivery_method: "Waterfall",
  current_phase: "",
  planned_start_date: "",
  planned_end_date: "",
  actual_start_date: "",
  actual_end_date: "",
  target_go_live: "",
  budget: "",
  capex_approved: "",
  opex_approved: "",
  capex_incurred: "0",
  opex_incurred: "0",
  benefits_target: "",
  benefits_realised: "0",
  roi_percent: "",
  description: "",
};

function numOrNull(v: string) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyToNull(v: string) {
  const s = String(v || "").trim();
  return s || null;
}

/** Guided end-to-end project create — Data Editor sequence with field hover help. */
export function ProjectCreateWizard() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [project, setProject] = useState(emptyProject);
  const [extraStreams, setExtraStreams] = useState<ExtraStream[]>([]);
  const [gates, setGates] = useState<GatePlan[]>([]);
  const [fyRows, setFyRows] = useState<FyRow[]>([
    { fy: "", budget: "", forecast: "", capex: "", opex: "" },
  ]);
  const [workItems, setWorkItems] = useState<WiRow[]>([
    { title: "", wbs_code: "1.0", estimate_hours: "", stage_gate_name: "" },
  ]);
  const [riskTitle, setRiskTitle] = useState("");
  const [stakeholderName, setStakeholderName] = useState("");
  const [stakeholderRole, setStakeholderRole] = useState("");

  const step = WIZARD_STEPS[stepIdx];

  const { data: bus = [] } = useQuery({
    queryKey: ["business_units", orgId, "wizard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_units")
        .select("id,code,name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: deliveryMethods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId,
  });

  const selectedMethod = findDeliveryMethod(deliveryMethods, project.delivery_method);
  const deliveryOpts =
    deliveryMethods.length > 0
      ? deliveryMethods.map((m) => m.name)
      : ["Waterfall", "Agile", "Hybrid"];

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId, "wizard", selectedMethod?.id],
    queryFn: async () => {
      let q = supabase
        .from("stage_gate_definitions")
        .select("gate_name,sort_order,delivery_method_id")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("sort_order");
      if (selectedMethod?.id) q = q.eq("delivery_method_id", selectedMethod.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // Seed / refresh gate plans when method definitions load or method changes
  useEffect(() => {
    if (!gateDefs.length) {
      setGates([]);
      return;
    }
    const start = project.planned_start_date || new Date().toISOString().slice(0, 10);
    const base = new Date(start);
    setGates(
      gateDefs.map((d: any, i: number) => {
        const dt = new Date(base);
        dt.setUTCDate(dt.getUTCDate() + i * 30);
        return {
          gate_name: d.gate_name,
          planned_date: dt.toISOString().slice(0, 10),
          include: true,
        };
      }),
    );
  }, [gateDefs, project.planned_start_date, selectedMethod?.id]);

  const setP = (key: string, value: string) =>
    setProject((p) => ({ ...p, [key]: value }));

  const validateProject = () => {
    if (!project.project_code.trim()) return "Project code is required";
    if (!project.name.trim()) return "Project name is required";
    return null;
  };

  const goNext = () => {
    if (step.id === "project") {
      const err = validateProject();
      if (err) return void toast.error(err);
    }
    setStepIdx((i) => Math.min(WIZARD_STEPS.length - 1, i + 1));
  };

  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  const finish = async () => {
    if (!orgId) return;
    const err = validateProject();
    if (err) {
      setStepIdx(0);
      return void toast.error(err);
    }
    setBusy(true);
    try {
      const code = project.project_code.trim();
      const dates = syncScheduleDates({
        planned_start_date: emptyToNull(project.planned_start_date),
        planned_end_date: emptyToNull(project.planned_end_date),
        actual_start_date: emptyToNull(project.actual_start_date),
        actual_end_date: emptyToNull(project.actual_end_date),
        start_date: null,
        end_date: null,
        target_go_live: emptyToNull(project.target_go_live),
      });

      const payload: Record<string, unknown> = {
        org_id: orgId,
        project_code: code,
        name: project.name.trim(),
        portfolio: project.portfolio || null,
        program: emptyToNull(project.program),
        sponsor: emptyToNull(project.sponsor),
        bu_id: emptyToNull(project.bu_id),
        priority: project.priority,
        status: project.status,
        rag: project.rag,
        delivery_method: project.delivery_method,
        delivery_method_id: selectedMethod?.id ?? null,
        current_phase: emptyToNull(project.current_phase),
        ...dates,
        budget: numOrNull(project.budget) ?? 0,
        capex_approved: numOrNull(project.capex_approved) ?? 0,
        opex_approved: numOrNull(project.opex_approved) ?? 0,
        capex_incurred: numOrNull(project.capex_incurred) ?? 0,
        opex_incurred: numOrNull(project.opex_incurred) ?? 0,
        benefits_target: numOrNull(project.benefits_target) ?? 0,
        benefits_realised: numOrNull(project.benefits_realised) ?? 0,
        roi_percent: numOrNull(project.roi_percent),
        description: emptyToNull(project.description),
      };

      let projectId = createdId;
      if (!projectId) {
        const { data: existing } = await supabase
          .from("projects")
          .select("id")
          .eq("org_id", orgId)
          .eq("project_code", code)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await supabase
            .from("projects")
            .update(payload as never)
            .eq("id", existing.id);
          if (error) throw error;
          projectId = existing.id;
          toast.message(`Updated existing ${code}`);
        } else {
          const { data, error } = await supabase
            .from("projects")
            .insert(payload as never)
            .select("id")
            .single();
          if (error) throw error;
          projectId = (data as { id: string }).id;
        }
        setCreatedId(projectId);
      } else {
        const { error } = await supabase
          .from("projects")
          .update(payload as never)
          .eq("id", projectId);
        if (error) throw error;
      }

      // Extra streams (Core is DB-triggered)
      const includedGateDates = gates
        .filter((x) => x.include && x.planned_date)
        .map((x) => x.planned_date)
        .sort();
      const streamStart =
        includedGateDates[0] || emptyToNull(project.planned_start_date);
      const streamEnd =
        includedGateDates[includedGateDates.length - 1] ||
        emptyToNull(project.planned_end_date);
      for (const s of extraStreams) {
        const name = s.name.trim();
        const scode = s.code.trim() || name.slice(0, 8).toUpperCase();
        if (!name) continue;
        const { error } = await supabase.from("project_streams").insert({
          org_id: orgId,
          project_id: projectId,
          name,
          code: scode,
          is_default: false,
          planned_start_date: streamStart,
          planned_end_date: streamEnd,
        } as never);
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      }

      // Resolve Core stream for work-item defaults; gates go on every stream
      const { data: streams } = await supabase
        .from("project_streams")
        .select("id,is_default,code")
        .eq("project_id", projectId);
      const coreId =
        (streams ?? []).find((s: any) => s.is_default)?.id ||
        (streams ?? []).find((s: any) => s.code === "CORE")?.id ||
        (streams ?? [])[0]?.id ||
        null;
      const streamIds = (streams ?? [])
        .map((s: any) => s.id)
        .filter(Boolean) as string[];
      const gateStreamIds = streamIds.length ? streamIds : coreId ? [coreId] : [];

      // Stage gates — one planned set per stream so Forecast can show each lane
      const useGates = methodUsesStageGates(selectedMethod, project.delivery_method);
      if (useGates) {
        const included = gates.filter((x) => x.include && x.gate_name);
        for (const sid of gateStreamIds) {
          for (const g of included) {
            const { error } = await supabase.from("stage_gates").insert({
              org_id: orgId,
              project_id: projectId,
              stream_id: sid,
              gate_name: g.gate_name,
              planned_date: emptyToNull(g.planned_date),
              status: "Pending",
            } as never);
            if (error && !/duplicate|unique/i.test(error.message)) throw error;
          }
        }
      }

      // FY allocations
      for (const row of fyRows) {
        if (!row.fy.trim()) continue;
        const { error } = await supabase.from("fy_allocations").insert({
          org_id: orgId,
          project_id: projectId,
          stream_id: coreId,
          fy: row.fy.trim(),
          budget: numOrNull(row.budget) ?? 0,
          forecast: numOrNull(row.forecast) ?? 0,
          capex: numOrNull(row.capex) ?? 0,
          opex: numOrNull(row.opex) ?? 0,
        } as never);
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      }

      // Work items
      const { data: createdGates } = await supabase
        .from("stage_gates")
        .select("id,gate_name,stream_id")
        .eq("project_id", projectId);
      const gateByName = new Map<string, string>();
      for (const g of createdGates ?? []) {
        if (coreId && g.stream_id && g.stream_id !== coreId) continue;
        gateByName.set(String(g.gate_name), g.id);
      }
      let sort = 0;
      for (const wi of workItems) {
        if (!wi.title.trim()) continue;
        sort += 10;
        const { error } = await supabase.from("work_items" as any).insert({
          org_id: orgId,
          project_id: projectId,
          stream_id: coreId,
          title: wi.title.trim(),
          wbs_code: emptyToNull(wi.wbs_code),
          estimate_hours: numOrNull(wi.estimate_hours) ?? 0,
          status: "To Do",
          priority: "Medium",
          percent_complete: 0,
          sort_order: sort,
          stage_gate_id: wi.stage_gate_name
            ? gateByName.get(wi.stage_gate_name) || null
            : null,
        } as never);
        if (error) throw error;
      }

      if (riskTitle.trim()) {
        const { error } = await supabase.from("risks").insert({
          org_id: orgId,
          project_id: projectId,
          title: riskTitle.trim(),
          status: "Open",
          probability: 3,
          impact: 3,
        } as never);
        if (error) throw error;
      }

      if (stakeholderName.trim() && stakeholderName.trim().toLowerCase() !== project.sponsor.trim().toLowerCase()) {
        const { error } = await supabase.from("stakeholders").insert({
          org_id: orgId,
          project_id: projectId,
          name: stakeholderName.trim(),
          role: emptyToNull(stakeholderRole),
        } as never);
        if (error) throw error;
      }

      toast.success("Project setup complete");
      navigate({ to: "/app/projects/$id", params: { id: projectId! } });
    } catch (e: any) {
      toast.error(e?.message || "Failed to create project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New project — guided setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            End-to-end create in Data Editor order. Hover any heading or field label for a
            description of what it drives in the platform.
          </p>
        </div>

        {/* Stepper */}
        <ol className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((s, i) => {
            const active = i === stepIdx;
            const done = i < stepIdx;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    active
                      ? "border-sky-400 bg-sky-50 text-sky-900"
                      : done
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-border bg-surface text-muted-foreground"
                  }`}
                  title={s.description}
                >
                  {done ? <Check className="h-3 w-3" /> : <span>{s.n}</span>}
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>

        <SectionFrame>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
            <div>
              <HelpHeading title={`Step ${step.n}. ${step.title}`} help={step.description} />
              <p className="mt-1 text-xs text-muted-foreground">
                Data Editor sheet: <span className="font-medium text-foreground">{step.dataEditorSheet}</span>
              </p>
            </div>
          </div>
          <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{step.description}</p>

          {step.id === "project" && (
            <div className="space-y-5">
              <div>
                <HelpHeading
                  as="h3"
                  title="Identity"
                  help="Master project keys used everywhere — same columns as Data Editor → Projects."
                />
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field id="project_code">
                    <input
                      className="st-input"
                      value={project.project_code}
                      onChange={(e) => setP("project_code", e.target.value)}
                      placeholder="PRJ-001"
                    />
                  </Field>
                  <Field id="name">
                    <input
                      className="st-input"
                      value={project.name}
                      onChange={(e) => setP("name", e.target.value)}
                      placeholder="Project name"
                    />
                  </Field>
                  <Field id="portfolio">
                    <select
                      className="st-input"
                      value={project.portfolio}
                      onChange={(e) => setP("portfolio", e.target.value)}
                    >
                      {PORTFOLIO_OPTS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="program">
                    <input
                      className="st-input"
                      value={project.program}
                      onChange={(e) => setP("program", e.target.value)}
                    />
                  </Field>
                  <Field id="sponsor">
                    <input
                      className="st-input"
                      value={project.sponsor}
                      onChange={(e) => setP("sponsor", e.target.value)}
                    />
                  </Field>
                  <Field id="bu_id">
                    <select
                      className="st-input"
                      value={project.bu_id}
                      onChange={(e) => setP("bu_id", e.target.value)}
                    >
                      <option value="">— None —</option>
                      {bus.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.code ? `${b.code} · ` : ""}
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div>
                <HelpHeading
                  as="h3"
                  title="Delivery & status"
                  help="Choose an org delivery method. Configure methods and gate templates under Delivery Methods & Gates."
                />
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field id="delivery_method">
                    <select
                      className="st-input"
                      value={project.delivery_method}
                      onChange={(e) => setP("delivery_method", e.target.value)}
                    >
                      {deliveryOpts.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="priority">
                    <select
                      className="st-input"
                      value={project.priority}
                      onChange={(e) => setP("priority", e.target.value)}
                    >
                      {PRIORITY_OPTS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="status">
                    <select
                      className="st-input"
                      value={project.status}
                      onChange={(e) => setP("status", e.target.value)}
                    >
                      {STATUS_OPTS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="rag">
                    <select
                      className="st-input"
                      value={project.rag}
                      onChange={(e) => setP("rag", e.target.value)}
                    >
                      {RAG_OPTS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="current_phase">
                    <input
                      className="st-input"
                      value={project.current_phase}
                      onChange={(e) => setP("current_phase", e.target.value)}
                      placeholder="e.g. Plan"
                    />
                  </Field>
                </div>
              </div>

              <div>
                <HelpHeading
                  as="h3"
                  title="Dates"
                  help="Planned/Actual drive Schedule Start/End used by Gantt, FY, and EVM schedule %."
                />
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      "planned_start_date",
                      "planned_end_date",
                      "target_go_live",
                      "actual_start_date",
                      "actual_end_date",
                    ] as const
                  ).map((k) => (
                    <Field key={k} id={k}>
                      <input
                        type="date"
                        className="st-input"
                        value={(project as any)[k]}
                        onChange={(e) => setP(k, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </div>

              <div>
                <HelpHeading
                  as="h3"
                  title="Financials"
                  help="Approved funding and CapEx/OpEx. Incurred usually starts at 0; EVM BAC uses baseline or these approved figures."
                />
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      "budget",
                      "capex_approved",
                      "opex_approved",
                      "benefits_target",
                      "roi_percent",
                      "capex_incurred",
                      "opex_incurred",
                      "benefits_realised",
                    ] as const
                  ).map((k) => (
                    <Field key={k} id={k}>
                      <input
                        type="number"
                        className="st-input"
                        value={(project as any)[k]}
                        onChange={(e) => setP(k, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </div>

              <Field id="description">
                <textarea
                  className="st-input"
                  rows={3}
                  value={project.description}
                  onChange={(e) => setP("description", e.target.value)}
                />
              </Field>
            </div>
          )}

          {step.id === "streams" && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <strong>Core</strong> stream is created automatically when the project is saved
                (database trigger). Add optional extra streams below.
              </div>
              {extraStreams.map((s, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Field id="stream_name">
                    <input
                      className="st-input"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...extraStreams];
                        next[i] = { ...next[i], name: e.target.value };
                        setExtraStreams(next);
                      }}
                      placeholder="Workstream name"
                    />
                  </Field>
                  <Field id="stream_code">
                    <input
                      className="st-input"
                      value={s.code}
                      onChange={(e) => {
                        const next = [...extraStreams];
                        next[i] = { ...next[i], code: e.target.value };
                        setExtraStreams(next);
                      }}
                      placeholder="WS1"
                    />
                  </Field>
                  <button
                    type="button"
                    className="self-end text-xs text-rose-600 hover:underline"
                    onClick={() => setExtraStreams(extraStreams.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="st-btn-secondary"
                onClick={() => setExtraStreams([...extraStreams, { name: "", code: "" }])}
              >
                + Add stream
              </button>
            </div>
          )}

          {step.id === "gates" && (
            <div className="space-y-3">
              {!methodUsesStageGates(selectedMethod, project.delivery_method) ? (
                <p className="text-sm text-muted-foreground">
                  Delivery method &quot;{project.delivery_method}&quot; does not use stage gates.
                  You can skip this step
                  {selectedMethod?.uses_sprints
                    ? " and plan sprints under Agile / Sprints after create."
                    : "."}
                </p>
              ) : !gateDefs.length ? (
                <p className="text-sm text-amber-800">
                  No active stage gate definitions for this method. Configure them under Delivery
                  Methods &amp; Gates, or skip and add gates later.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Gates from the{" "}
                    <span className="font-medium">
                      {selectedMethod?.name ?? project.delivery_method}
                    </span>{" "}
                    template — created on <strong>every stream</strong> (Core
                    {extraStreams.filter((s) => s.name.trim()).length
                      ? ` + ${extraStreams.filter((s) => s.name.trim()).length} extra`
                      : ""}
                    ) so Forecast can show phases per stream. Not shared with other
                    delivery methods.
                  </p>
                  {gates.map((g, i) => (
                    <div
                      key={g.gate_name}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={g.include}
                        onChange={(e) => {
                          const next = [...gates];
                          next[i] = { ...next[i], include: e.target.checked };
                          setGates(next);
                        }}
                      />
                      <span className="text-sm font-medium">{g.gate_name}</span>
                      <div className="w-40">
                        <HelpHeading as="label" title="planned date" help={FIELD_HELP.gate_planned} />
                        <input
                          type="date"
                          className="st-input !h-8 mt-0.5"
                          value={g.planned_date}
                          disabled={!g.include}
                          onChange={(e) => {
                            const next = [...gates];
                            next[i] = { ...next[i], planned_date: e.target.value };
                            setGates(next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step.id === "fy" && (
            <div className="space-y-3">
              {fyRows.map((row, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-5">
                  <Field id="fy">
                    <input
                      className="st-input"
                      placeholder="FY26"
                      value={row.fy}
                      onChange={(e) => {
                        const next = [...fyRows];
                        next[i] = { ...next[i], fy: e.target.value };
                        setFyRows(next);
                      }}
                    />
                  </Field>
                  <Field id="fy_budget">
                    <input
                      type="number"
                      className="st-input"
                      value={row.budget}
                      onChange={(e) => {
                        const next = [...fyRows];
                        next[i] = { ...next[i], budget: e.target.value };
                        setFyRows(next);
                      }}
                    />
                  </Field>
                  <Field id="fy_forecast">
                    <input
                      type="number"
                      className="st-input"
                      value={row.forecast}
                      onChange={(e) => {
                        const next = [...fyRows];
                        next[i] = { ...next[i], forecast: e.target.value };
                        setFyRows(next);
                      }}
                    />
                  </Field>
                  <Field id="fy_capex">
                    <input
                      type="number"
                      className="st-input"
                      value={row.capex}
                      onChange={(e) => {
                        const next = [...fyRows];
                        next[i] = { ...next[i], capex: e.target.value };
                        setFyRows(next);
                      }}
                    />
                  </Field>
                  <Field id="fy_opex">
                    <input
                      type="number"
                      className="st-input"
                      value={row.opex}
                      onChange={(e) => {
                        const next = [...fyRows];
                        next[i] = { ...next[i], opex: e.target.value };
                        setFyRows(next);
                      }}
                    />
                  </Field>
                </div>
              ))}
              <button
                type="button"
                className="st-btn-secondary"
                onClick={() =>
                  setFyRows([...fyRows, { fy: "", budget: "", forecast: "", capex: "", opex: "" }])
                }
              >
                + Add FY row
              </button>
              <p className="text-[11px] text-muted-foreground">Leave blank to skip — you can add FY rows later.</p>
            </div>
          )}

          {step.id === "work" && (
            <div className="space-y-3">
              {workItems.map((wi, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-4">
                  <Field id="wi_title" className="md:col-span-2">
                    <input
                      className="st-input"
                      value={wi.title}
                      onChange={(e) => {
                        const next = [...workItems];
                        next[i] = { ...next[i], title: e.target.value };
                        setWorkItems(next);
                      }}
                      placeholder="Task title"
                    />
                  </Field>
                  <Field id="wi_wbs">
                    <input
                      className="st-input"
                      value={wi.wbs_code}
                      onChange={(e) => {
                        const next = [...workItems];
                        next[i] = { ...next[i], wbs_code: e.target.value };
                        setWorkItems(next);
                      }}
                    />
                  </Field>
                  <Field id="wi_hours">
                    <input
                      type="number"
                      className="st-input"
                      value={wi.estimate_hours}
                      onChange={(e) => {
                        const next = [...workItems];
                        next[i] = { ...next[i], estimate_hours: e.target.value };
                        setWorkItems(next);
                      }}
                    />
                  </Field>
                  <Field id="wi_gate" className="md:col-span-2">
                    <select
                      className="st-input"
                      value={wi.stage_gate_name}
                      onChange={(e) => {
                        const next = [...workItems];
                        next[i] = { ...next[i], stage_gate_name: e.target.value };
                        setWorkItems(next);
                      }}
                    >
                      <option value="">— No gate —</option>
                      {gates
                        .filter((g) => g.include)
                        .map((g) => (
                          <option key={g.gate_name} value={g.gate_name}>
                            {g.gate_name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
              ))}
              <button
                type="button"
                className="st-btn-secondary"
                onClick={() =>
                  setWorkItems([
                    ...workItems,
                    {
                      title: "",
                      wbs_code: `${workItems.length + 1}.0`,
                      estimate_hours: "",
                      stage_gate_name: "",
                    },
                  ])
                }
              >
                + Add work item
              </button>
            </div>
          )}

          {step.id === "governance" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <HelpHeading as="h3" title="First risk (optional)" help={FIELD_HELP.risk_title} />
                <div className="mt-2">
                  <Field id="risk_title">
                    <input
                      className="st-input"
                      value={riskTitle}
                      onChange={(e) => setRiskTitle(e.target.value)}
                      placeholder="e.g. Key vendor dependency"
                    />
                  </Field>
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <HelpHeading
                  as="h3"
                  title="First stakeholder (optional)"
                  help="Opens the stakeholders register for engagement tracking."
                />
                <div className="mt-2 space-y-2">
                  <Field id="stakeholder_name">
                    <input
                      className="st-input"
                      value={stakeholderName}
                      onChange={(e) => setStakeholderName(e.target.value)}
                    />
                  </Field>
                  <Field id="stakeholder_role">
                    <input
                      className="st-input"
                      value={stakeholderRole}
                      onChange={(e) => setStakeholderRole(e.target.value)}
                      placeholder="Role / interest"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {step.id === "review" && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <div className="font-semibold">
                  {project.project_code || "—"} · {project.name || "Untitled"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {project.portfolio} · {project.delivery_method} · {project.status} · RAG{" "}
                  {project.rag}
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Core stream auto-created; extra streams: {extraStreams.filter((s) => s.name.trim()).length}</li>
                <li>
                  Stage gates to create:{" "}
                  {methodUsesStageGates(selectedMethod, project.delivery_method)
                    ? `${gates.filter((g) => g.include).length} planned dates × ${
                        1 + extraStreams.filter((s) => s.name.trim()).length
                      } streams`
                    : 0}
                </li>
                <li>FY rows: {fyRows.filter((r) => r.fy.trim()).length}</li>
                <li>Work items: {workItems.filter((w) => w.title.trim()).length}</li>
                <li>Risk: {riskTitle.trim() ? "yes" : "no"} · Stakeholder: {stakeholderName.trim() ? "yes" : "no"}</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                After finish you land on the project detail page. Next, open{" "}
                <strong>Project Estimation Planning</strong> to allocate phase effort on each
                stream — that becomes the planned timeline and planned FTE. Forecast starts equal
                to that plan (FY Allocation). When Actual Start is recorded, actuals show beside
                the plan.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <button
              type="button"
              className="st-btn-secondary inline-flex items-center gap-1"
              disabled={stepIdx === 0 || busy}
              onClick={goBack}
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step.id !== "review" ? (
              <button
                type="button"
                className="st-btn-primary inline-flex items-center gap-1"
                disabled={busy}
                onClick={goNext}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className="st-btn-primary"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy ? "Saving…" : "Finish & open project"}
              </button>
            )}
          </div>
        </SectionFrame>
      </div>
    </TooltipProvider>
  );
}
