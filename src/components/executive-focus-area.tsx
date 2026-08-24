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
        search={{ tab: (link.tab as "overview" | "finance") || "overview" }}
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
      <p className="mt-2 text-[12px] font-medium text-primary">{item.link.label} →</p>
    </FocusCardLink>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  count,
  indent,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
  indent?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 py-0.5 text-[12px] ${
        indent ? "pl-5 text-muted-foreground" : "font-medium text-foreground"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-primary"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {count != null ? (
        <span className="tabular-nums text-[11px] text-muted-foreground">{count}</span>
      ) : null}
    </label>
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
  const [areas, setAreas] = useState<FocusArea[]>([]);
  const [subtypes, setSubtypes] = useState<string[]>([]);
  const [bands, setBands] = useState<FocusCriticality[]>([]);
  const [horizons, setHorizons] = useState<Array<"overdue" | "30d">>([]);

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
    const areaSet = new Set(areas);
    const subSet = new Set(subtypes);
    const bandSet = new Set(bands);
    const horizonSet = new Set(horizons);
    return [...focus.top, ...AREAS.flatMap((a) => focus.byArea[a])]
      .filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i)
      .filter((item) => {
        if (areaSet.size && !areaSet.has(item.area)) return false;
        const subs = FOCUS_AREA_SUBSETS[item.area];
        if (subs.length && item.subtype) {
          const selectedForArea = subs.filter((s) => subSet.has(`${item.area}:${s.id}`));
          if (selectedForArea.length && !subSet.has(`${item.area}:${item.subtype}`)) return false;
        }
        if (bandSet.size && !bandSet.has(item.criticality)) return false;
        if (horizonSet.size) {
          const overdue = item.daysRemaining != null && item.daysRemaining < 0;
          const in30 = item.daysRemaining == null || item.daysRemaining <= 30;
          if (horizonSet.has("overdue") && horizonSet.has("30d")) {
            if (!overdue && !in30) return false;
          } else if (horizonSet.has("overdue") && !overdue) return false;
          else if (horizonSet.has("30d") && !in30) return false;
        }
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [focus, areas, subtypes, bands, horizons]);

  const countInArea = (area: FocusArea) => focus.byArea[area].length;
  const countSubtype = (area: FocusArea, id: string) =>
    focus.byArea[area].filter((i) => i.subtype === id).length;

  const toggleArea = (area: FocusArea) => {
    const on = areas.includes(area);
    if (on) {
      setAreas(areas.filter((a) => a !== area));
      setSubtypes(subtypes.filter((s) => !s.startsWith(`${area}:`)));
    } else {
      setAreas([...areas, area]);
      const keys = FOCUS_AREA_SUBSETS[area].map((s) => `${area}:${s.id}`);
      setSubtypes([...subtypes.filter((s) => !s.startsWith(`${area}:`)), ...keys]);
    }
  };

  const toggleSubtype = (area: FocusArea, id: string) => {
    const key = `${area}:${id}`;
    const on = subtypes.includes(key);
    const next = on ? subtypes.filter((s) => s !== key) : [...subtypes, key];
    setSubtypes(next);
    const anySub = FOCUS_AREA_SUBSETS[area].some((s) => next.includes(`${area}:${s.id}`));
    if (anySub && !areas.includes(area)) setAreas([...areas, area]);
    if (!anySub && areas.includes(area)) setAreas(areas.filter((a) => a !== area));
  };

  const toggleBand = (band: FocusCriticality) => {
    setBands(bands.includes(band) ? bands.filter((b) => b !== band) : [...bands, band]);
  };

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

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <fieldset className="min-w-0">
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Focus area
            </legend>
            <CheckRow
              checked={areas.length === 0}
              onChange={() => {
                setAreas([]);
                setSubtypes([]);
              }}
              label="All areas"
              count={AREAS.reduce((n, a) => n + countInArea(a), 0)}
            />
            {AREAS.map((area) => {
              const subs = FOCUS_AREA_SUBSETS[area];
              return (
                <div key={area} className="mt-1">
                  <CheckRow
                    checked={areas.includes(area)}
                    onChange={() => toggleArea(area)}
                    label={FOCUS_AREA_LABEL[area]}
                    count={countInArea(area)}
                  />
                  {subs.map((sub) => (
                    <CheckRow
                      key={sub.id}
                      indent
                      checked={subtypes.includes(`${area}:${sub.id}`)}
                      onChange={() => toggleSubtype(area, sub.id)}
                      label={sub.label}
                      count={countSubtype(area, sub.id)}
                    />
                  ))}
                </div>
              );
            })}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Criticality
            </legend>
            <CheckRow
              checked={bands.length === 0}
              onChange={() => setBands([])}
              label="All criticality"
              count={s.critical + s.high + s.watch}
            />
            <CheckRow
              checked={bands.includes("Critical")}
              onChange={() => toggleBand("Critical")}
              label="Critical"
              count={s.critical}
            />
            <CheckRow
              checked={bands.includes("High")}
              onChange={() => toggleBand("High")}
              label="High"
              count={s.high}
            />
            <CheckRow
              checked={bands.includes("Watch")}
              onChange={() => toggleBand("Watch")}
              label="Watch"
              count={s.watch}
            />
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Due
            </legend>
            <CheckRow
              checked={horizons.length === 0}
              onChange={() => setHorizons([])}
              label="Any date"
            />
            <CheckRow
              checked={horizons.includes("overdue")}
              onChange={() =>
                setHorizons(
                  horizons.includes("overdue")
                    ? horizons.filter((h) => h !== "overdue")
                    : [...horizons, "overdue"],
                )
              }
              label="Overdue"
            />
            <CheckRow
              checked={horizons.includes("30d")}
              onChange={() =>
                setHorizons(
                  horizons.includes("30d") ? horizons.filter((h) => h !== "30d") : [...horizons, "30d"],
                )
              }
              label="Due in 30 days"
            />
          </fieldset>
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
