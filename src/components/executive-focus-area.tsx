import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RagChip, SectionFrame } from "@/components/streamlit";
import { ExpandablePanel } from "@/components/expandable-panel";
import type { BriefingDecision, BriefingGate, BriefingProject, BriefingRisk } from "@/lib/executive-briefing";
import {
  buildExecutiveFocus,
  focusAreaCounts,
  type FocusArea,
  type FocusCriticality,
  type FocusDependency,
  type FocusIssue,
  type FocusItem,
  type FocusLink,
  FOCUS_AREA_LABEL,
} from "@/lib/executive-focus";
import type { CapacityAllocation, CapacityResource } from "@/lib/executive-intelligence";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";

const AREA_FILTERS: Array<FocusArea | "all"> = [
  "all",
  "delivery",
  "financial",
  "resource",
  "risk",
  "decision",
  "dependency",
  "benefit",
];

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function ragOf(c: FocusCriticality): "Red" | "Amber" | "Green" {
  if (c === "Critical") return "Red";
  if (c === "High") return "Amber";
  return "Green";
}

function FocusSourceLink({ link }: { link: FocusLink }) {
  const className = "text-[12px] font-medium text-primary hover:underline";
  if (link.kind === "project" && link.projectId) {
    return (
      <Link
        to="/app/projects/$id"
        params={{ id: link.projectId }}
        search={{ tab: (link.tab as "overview" | "finance") || "overview" }}
        className={className}
      >
        {link.label}
      </Link>
    );
  }
  if (link.kind === "financials") {
    return (
      <Link
        to="/app/financials"
        search={link.projectId ? { pid: link.projectId } : undefined}
        className={className}
      >
        {link.label}
      </Link>
    );
  }
  const to =
    link.kind === "resources"
      ? "/app/resources"
      : link.kind === "risks"
        ? "/app/risks"
        : link.kind === "issues"
          ? "/app/issues"
          : link.kind === "decisions"
            ? "/app/decisions"
            : link.kind === "dependencies"
              ? "/app/dependencies"
              : link.kind === "benefits"
                ? "/app/benefits"
                : "/app/stage-gates";
  return (
    <Link to={to} className={className}>
      {link.label}
    </Link>
  );
}

function FocusCard({ item, rank }: { item: FocusItem; rank?: number }) {
  return (
    <article className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {rank != null ? `${rank}. ` : ""}
            {FOCUS_AREA_LABEL[item.area]}
          </p>
          <p className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">{item.title}</p>
        </div>
        <RagChip rag={ragOf(item.criticality)} label={`${item.criticality} · ${item.headline}`} />
      </div>
      <dl className="mt-2 grid gap-1 text-[12px] leading-snug text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="font-medium text-foreground/70">Why</dt>
          <dd>{item.why}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground/70">Impact</dt>
          <dd>{item.impact}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground/70">Action</dt>
          <dd>{item.action}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground/70">Owner · due</dt>
          <dd>
            {item.owner}
            {item.dueDate
              ? ` · ${item.dueDate}${
                  item.daysRemaining != null
                    ? item.daysRemaining < 0
                      ? ` · ${Math.abs(item.daysRemaining)}d overdue`
                      : ` · ${item.daysRemaining}d left`
                    : ""
                }`
              : ""}
          </dd>
        </div>
      </dl>
      <div className="mt-2">
        <FocusSourceLink link={item.link} />
      </div>
    </article>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/25"
      }`}
    >
      {children}
    </button>
  );
}

export function ExecutiveFocusArea({
  projects,
  gates,
  monthly,
}: {
  projects: BriefingProject[];
  gates: BriefingGate[];
  monthly: MonthlyFinanceRow[];
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const [area, setArea] = useState<FocusArea | "all">("all");
  const [band, setBand] = useState<FocusCriticality | "all">("all");
  const [horizon, setHorizon] = useState<"all" | "overdue" | "30d">("all");

  const risksQ = useQuery({
    queryKey: ["risks", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risks")
        .select("id,project_id,raid_code,title,status,severity,probability,impact,owner")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as BriefingRisk[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const decisionsQ = useQuery({
    queryKey: ["decisions", orgId, "exec-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,project_id,raid_code,title,outcome,status,required_date,recommendation")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as BriefingDecision[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const issuesQ = useQuery({
    queryKey: ["issues", orgId, "exec-focus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("id,project_id,raid_code,title,status,priority,owner,target_date,escalation_level,escalation_reason")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as FocusIssue[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const depsQ = useQuery({
    queryKey: ["dependencies", orgId, "exec-focus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dependencies")
        .select("id,project_id,depends_on_project_id,title,description,status,needed_by,owner")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as FocusDependency[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const workItemsQ = useQuery({
    queryKey: ["work_items", orgId, "portfolio-pulse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as never)
        .select("id,project_id,status,percent_complete,estimate_hours")
        .eq("org_id", orgId!)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const resourcesQ = useQuery({
    queryKey: ["resources", orgId, "exec-focus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,role,skills,capacity_hours_week,status")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as CapacityResource[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const allocationsQ = useQuery({
    queryKey: ["resource_allocations", orgId, "exec-focus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_allocations")
        .select("id,project_id,resource_id,allocation_percent,allocated_hours,period_month")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as CapacityAllocation[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const benefitsQ = useQuery({
    queryKey: ["benefits", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("id,project_id,target_value,realised_value")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const fyAllocQ = useQuery({
    queryKey: ["fy_allocations", orgId, "health"],
    queryFn: async () =>
      (
        await supabase
          .from("fy_allocations")
          .select("id,project_id,fy,budget,forecast,capex,opex,benefits")
          .eq("org_id", orgId!)
          .limit(10000)
      ).data ?? [],
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const focus = useMemo(
    () =>
      buildExecutiveFocus({
        projects,
        gates,
        monthly: monthly.filter((m) => m.project_id && m.period_month),
        risks: (risksQ.data ?? []).filter((r) => ids.includes(r.project_id)),
        issues: (issuesQ.data ?? []).filter((i) => ids.includes(i.project_id)),
        decisions: (decisionsQ.data ?? []).filter((d) => ids.includes(d.project_id)),
        dependencies: depsQ.data ?? [],
        resources: resourcesQ.data ?? [],
        allocations: allocationsQ.data ?? [],
        workItems: (workItemsQ.data ?? []) as HealthEngineInput["workItems"],
        benefitLines: (benefitsQ.data ?? []) as HealthEngineInput["benefitLines"],
        fyAllocations: (fyAllocQ.data ?? []) as HealthEngineInput["fyAllocations"],
        fyStartMonth: organization?.fy_start_month || 4,
        weights: organization?.ui_config,
      }),
    [
      projects,
      gates,
      monthly,
      risksQ.data,
      issuesQ.data,
      decisionsQ.data,
      depsQ.data,
      resourcesQ.data,
      allocationsQ.data,
      workItemsQ.data,
      benefitsQ.data,
      fyAllocQ.data,
      organization?.fy_start_month,
      organization?.ui_config,
      ids,
    ],
  );

  const today = new Date().toISOString().slice(0, 10);
  const visible = (item: FocusItem) => {
    if (area !== "all" && item.area !== area) return false;
    if (band !== "all" && item.criticality !== band) return false;
    if (horizon === "overdue") return item.daysRemaining != null && item.daysRemaining < 0;
    if (horizon === "30d") {
      if (item.daysRemaining == null) return true;
      return item.daysRemaining <= 30;
    }
    return true;
  };

  const top = focus.top.filter(visible);
  const counts = focusAreaCounts(focus);
  const s = focus.summary;

  return (
    <SectionFrame exportName="pulse-focus" exportTitle="Executive Focus">
      <ExpandablePanel
        title="Executive Focus"
        compactMaxHeightClass="max-h-none"
        toolbar={
          <p className="text-[11px] text-muted-foreground">
            What needs my attention today · as of {today}
          </p>
        }
      >
          <p className="mb-3 text-[12px] text-muted-foreground">
            Action list, not a dashboard. Ranked by business, financial, and schedule impact — not
            every Red RAG. Tune weights in organisation <code>ui_config.executive_focus</code>.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryTile tone="red" label="Critical" value={String(s.critical)} />
            <SummaryTile tone="amber" label="High" value={String(s.high)} />
            <SummaryTile tone="watch" label="Watch" value={String(s.watch)} />
            <SummaryTile tone="red" label="Decisions required" value={String(s.decisionsRequired)} />
            <SummaryTile tone="red" label="Delivery issues" value={String(s.deliveryIssues)} />
            <SummaryTile tone="money" label="Financial exposure" value={money(s.financialExposure)} />
            <SummaryTile tone="people" label="Capability gap" value={`${s.fteGap} FTE`} />
            <SummaryTile tone="link" label="Critical dependencies" value={String(s.criticalDependencies)} />
            <SummaryTile tone="goal" label="Benefits at risk" value={String(s.benefitsAtRisk)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {AREA_FILTERS.map((key) => (
              <Chip key={key} active={area === key} onClick={() => setArea(key)}>
                {key === "all" ? "All areas" : FOCUS_AREA_LABEL[key]}
              </Chip>
            ))}
            {(["all", "Critical", "High", "Watch"] as const).map((key) => (
              <Chip key={key} active={band === key} onClick={() => setBand(key)}>
                {key === "all" ? "All criticality" : key}
              </Chip>
            ))}
            {(["all", "overdue", "30d"] as const).map((key) => (
              <Chip key={key} active={horizon === key} onClick={() => setHorizon(key)}>
                {key === "all" ? "Any date" : key === "overdue" ? "Overdue" : "Due in 30 days"}
              </Chip>
            ))}
          </div>

          <div className="mt-5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top executive attention
            </h3>
            {top.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing in this filter needs executive attention today.
              </p>
            ) : (
              <div className="mt-2 grid gap-2">
                {top.map((item, i) => (
                  <FocusCard key={item.id} item={item} rank={i + 1} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {counts.map((row) => (
              <button
                key={row.area}
                type="button"
                onClick={() => setArea(row.area)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  area === row.area ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{row.count}</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.critical ? `${row.critical} critical` : "none critical"}
                </p>
              </button>
            ))}
          </div>

          {area !== "all" ? (
            <div className="mt-4 grid gap-2">
              {focus.byArea[area].filter(visible).map((item) => (
                <FocusCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </ExpandablePanel>
    </SectionFrame>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "amber" | "watch" | "money" | "people" | "link" | "goal";
}) {
  const bar =
    tone === "red"
      ? "#dc2626"
      : tone === "amber"
        ? "#d97706"
        : tone === "watch"
          ? "#ca8a04"
          : tone === "money"
            ? "#0f766e"
            : tone === "people"
              ? "#1d4ed8"
              : tone === "link"
                ? "#7c3aed"
                : "#be185d";
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: bar }} aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}
