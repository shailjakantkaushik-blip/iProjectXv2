import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RagChip, SectionFrame } from "@/components/streamlit";
import { ExpandablePanel } from "@/components/expandable-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BriefingDecision, BriefingGate, BriefingProject, BriefingRisk } from "@/lib/executive-briefing";
import {
  buildExecutiveFocus,
  FOCUS_AREA_LABEL,
  FOCUS_AREA_SUBSETS,
  type FocusArea,
  type FocusCriticality,
  type FocusDependency,
  type FocusIssue,
  type FocusItem,
  type FocusLink,
} from "@/lib/executive-focus";
import type { CapacityAllocation, CapacityResource } from "@/lib/executive-intelligence";
import type { HealthEngineInput } from "@/lib/project-health-engine";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";

const AREAS: FocusArea[] = [
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

const cardClass =
  "block rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.03]";

function FocusCardLink({
  link,
  children,
}: {
  link: FocusLink;
  children: ReactNode;
}) {
  if (link.kind === "project" && link.projectId) {
    return (
      <Link
        to="/app/projects/$id"
        params={{ id: link.projectId }}
        search={{ tab: (link.tab as "overview" | "finance" | "phases" | "governance" | "decisions") || "overview" }}
        className={cardClass}
      >
        {children}
      </Link>
    );
  }
  if (link.kind === "financials") {
    return (
      <Link
        to="/app/financials"
        search={link.projectId ? { pid: link.projectId } : undefined}
        className={cardClass}
      >
        {children}
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
    <Link to={to} className={cardClass}>
      {children}
    </Link>
  );
}

function FocusCard({ item, rank }: { item: FocusItem; rank?: number }) {
  return (
    <FocusCardLink link={item.link}>
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
          <dt className="font-medium text-foreground/70">Ask</dt>
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
      <p className="mt-2 text-[12px] font-medium text-primary">{item.link.label} →</p>
    </FocusCardLink>
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
  const [subtype, setSubtype] = useState("all");
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
  const items = useMemo(() => {
    const subsets = area === "all" ? [] : FOCUS_AREA_SUBSETS[area];
    return [...focus.top, ...AREAS.flatMap((a) => focus.byArea[a])]
      .filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i)
      .filter((item) => {
        if (area !== "all" && item.area !== area) return false;
        if (subsets.length && subtype !== "all" && item.subtype !== subtype) return false;
        if (band !== "all" && item.criticality !== band) return false;
        if (horizon === "overdue") {
          if (!(item.daysRemaining != null && item.daysRemaining < 0)) return false;
        } else if (horizon === "30d") {
          if (item.daysRemaining == null || item.daysRemaining > 30) return false;
        }
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [focus, area, subtype, band, horizon]);

  const countInArea = (a: FocusArea) => focus.byArea[a].length;
  const countSubtype = (a: FocusArea, id: string) =>
    focus.byArea[a].filter((i) => i.subtype === id).length;
  const areaSubsets = area === "all" ? [] : FOCUS_AREA_SUBSETS[area];
  const s = focus.summary;

  return (
    <SectionFrame exportName="cockpit-focus" exportTitle="Executive Focus">
      <ExpandablePanel
        title="Executive Focus"
        compactMaxHeightClass="max-h-none"
        toolbar={
          <p className="text-[11px] text-muted-foreground">
            What needs my attention today · steering pack · as of {today}
          </p>
        }
      >
        <p className="text-[13px] text-foreground">
          <span className="font-semibold text-rose-700">{s.critical} Critical</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold text-amber-800">{s.high} High</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold text-yellow-700">{s.watch} Watch</span>
          {s.financialExposure > 0 ? (
            <>
              <span className="text-muted-foreground"> · </span>
              {money(s.financialExposure)} exposure
            </>
          ) : null}
          {s.decisionsRequired ? (
            <>
              <span className="text-muted-foreground"> · </span>
              {s.decisionsRequired} decision{s.decisionsRequired === 1 ? "" : "s"}
            </>
          ) : null}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Ranked by business, financial, and schedule impact — not every Red status. Open a card for
          the source record.
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          <Link to="/app/demand-pipeline" className="font-medium text-primary hover:underline">
            Demand
          </Link>
          <Link to="/app/prioritisation" className="font-medium text-primary hover:underline">
            Prioritisation
          </Link>
          <Link to="/app/risks" className="font-medium text-primary hover:underline">
            Risks
          </Link>
          <Link to="/app/actions" className="font-medium text-primary hover:underline">
            Actions
          </Link>
          <Link to="/app/issues" className="font-medium text-primary hover:underline">
            Issues
          </Link>
          <Link to="/app/decisions" className="font-medium text-primary hover:underline">
            Decisions
          </Link>
          <Link to="/app/stage-gates" className="font-medium text-primary hover:underline">
            Stage gates
          </Link>
          <Link to="/app/financials" className="font-medium text-primary hover:underline">
            Financials
          </Link>
        </nav>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Focus area
            </label>
            <Select
              value={area}
              onValueChange={(v) => {
                setArea(v as FocusArea | "all");
                setSubtype("all");
              }}
            >
              <SelectTrigger className="h-9" aria-label="Focus area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All areas ({AREAS.reduce((n, a) => n + countInArea(a), 0)})
                </SelectItem>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {FOCUS_AREA_LABEL[a]} ({countInArea(a)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {area !== "all" && areaSubsets.length ? (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {FOCUS_AREA_LABEL[area]}
              </label>
              <Select value={subtype} onValueChange={setSubtype}>
                <SelectTrigger className="h-9" aria-label={`${FOCUS_AREA_LABEL[area]} subset`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {FOCUS_AREA_LABEL[area].toLowerCase()}</SelectItem>
                  {areaSubsets.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.label} ({countSubtype(area, sub.id)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Criticality
            </label>
            <Select value={band} onValueChange={(v) => setBand(v as FocusCriticality | "all")}>
              <SelectTrigger className="h-9" aria-label="Criticality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({s.critical + s.high + s.watch})</SelectItem>
                <SelectItem value="Critical">Critical ({s.critical})</SelectItem>
                <SelectItem value="High">High ({s.high})</SelectItem>
                <SelectItem value="Watch">Watch ({s.watch})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Due
            </label>
            <Select value={horizon} onValueChange={(v) => setHorizon(v as "all" | "overdue" | "30d")}>
              <SelectTrigger className="h-9" aria-label="Due">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any date</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="30d">Due in 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Attention
          </h3>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing in this filter needs executive attention today.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {items.slice(0, 12).map((item, i) => (
                <FocusCard key={item.id} item={item} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </ExpandablePanel>
    </SectionFrame>
  );
}
