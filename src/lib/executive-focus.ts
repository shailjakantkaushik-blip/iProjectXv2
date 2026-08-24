/**
 * Executive Focus — action-oriented attention items for Portfolio Pulse.
 * Not a second dashboard: only items that need executive attention today.
 */
import { isDecisionAwaiting } from "@/lib/decision-approval";
import { computeCapacityGap, type CapacityAllocation, type CapacityResource } from "@/lib/executive-intelligence";
import {
  projectApprovedFunding,
  projectBenefitsRealised,
  projectBenefitsTarget,
  projectForecast,
  projectIncurred,
} from "@/lib/project-finance";
import { projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import {
  evaluateProjectHealth,
  type HealthEngineInput,
  type HealthEngineResult,
} from "@/lib/project-health-engine";
import { raidLabel } from "@/lib/raid-code";
import type { BriefingDecision, BriefingGate, BriefingProject, BriefingRisk } from "@/lib/executive-briefing";

export type FocusArea =
  | "delivery"
  | "financial"
  | "resource"
  | "risk"
  | "decision"
  | "dependency"
  | "benefit";

export type FocusCriticality = "Critical" | "High" | "Watch";

export type FocusLinkKind =
  | "project"
  | "financials"
  | "resources"
  | "risks"
  | "issues"
  | "decisions"
  | "dependencies"
  | "benefits"
  | "gates";

export type FocusLink = {
  kind: FocusLinkKind;
  label: string;
  projectId?: string;
  tab?: string;
};

export type FocusItem = {
  id: string;
  area: FocusArea;
  criticality: FocusCriticality;
  score: number;
  title: string;
  headline: string;
  why: string;
  impact: string;
  action: string;
  owner: string;
  dueDate: string | null;
  daysRemaining: number | null;
  projectId: string | null;
  projectLabel: string;
  link: FocusLink;
  /** Narrower kind under `area` — used by checkbox subsets. */
  subtype?: string;
  amount?: number;
  projectsImpacted?: number;
};

export type FocusProjectScore = {
  projectId: string;
  projectLabel: string;
  score: number;
  criticality: FocusCriticality | "Stable";
};

export type FocusSummary = {
  critical: number;
  high: number;
  watch: number;
  decisionsRequired: number;
  deliveryIssues: number;
  financialExposure: number;
  fteGap: number;
  criticalDependencies: number;
  benefitsAtRisk: number;
};

export type FocusWeights = {
  businessImpact: number;
  financialImpact: number;
  scheduleImpact: number;
  urgency: number;
  multiProject: number;
  execIntervention: number;
  riskSeverity: number;
  customerImpact: number;
};

/** Default PMO model. Override via organizations.ui_config.executive_focus.weights. */
export const DEFAULT_FOCUS_WEIGHTS: FocusWeights = {
  businessImpact: 20,
  financialImpact: 18,
  scheduleImpact: 15,
  urgency: 12,
  multiProject: 10,
  execIntervention: 10,
  riskSeverity: 10,
  customerImpact: 5,
};

export const FOCUS_AREA_LABEL: Record<FocusArea, string> = {
  delivery: "Delivery",
  financial: "Financial",
  resource: "Resources",
  risk: "Risks & issues",
  decision: "Decisions",
  dependency: "Dependencies",
  benefit: "Benefits",
};

/** Sub-filters shown under an area header when that area has more than one kind. */
export const FOCUS_AREA_SUBSETS: Record<FocusArea, { id: string; label: string }[]> = {
  delivery: [
    { id: "delay", label: "Schedule delay" },
    { id: "gate", label: "Late gate" },
  ],
  financial: [
    { id: "actual", label: "Actual overrun" },
    { id: "forecast", label: "Forecast overrun" },
    { id: "burn", label: "Burn-rate anomaly" },
    { id: "funding", label: "Funding gap" },
  ],
  resource: [],
  risk: [
    { id: "risk", label: "Critical risks" },
    { id: "issue", label: "Escalated issues" },
  ],
  decision: [
    { id: "overdue", label: "Overdue" },
    { id: "waiting", label: "Waiting" },
  ],
  dependency: [],
  benefit: [],
};

export type FocusIssue = {
  id: string;
  project_id: string;
  raid_code?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  owner?: string | null;
  target_date?: string | null;
  escalation_level?: number | null;
  escalation_reason?: string | null;
};

export type FocusDependency = {
  id: string;
  project_id: string;
  depends_on_project_id?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  needed_by?: string | null;
  owner?: string | null;
};

export type FocusResult = {
  summary: FocusSummary;
  top: FocusItem[];
  byArea: Record<FocusArea, FocusItem[]>;
  projectScores: FocusProjectScore[];
};

const AREAS: FocusArea[] = [
  "delivery",
  "financial",
  "resource",
  "risk",
  "decision",
  "dependency",
  "benefit",
];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function isoDay(raw?: string | null) {
  return String(raw || "").slice(0, 10) || null;
}

function daysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function labelOf(p: BriefingProject) {
  return p.project_code ? `${p.project_code} · ${p.name || "Project"}` : String(p.name || p.id);
}

function ownerOf(p: BriefingProject) {
  return String(p.sponsor || "").trim() || "Unassigned";
}

function isGateScheduleDelayed(
  gate: { planned_date?: string | null; actual_date?: string | null; status?: string | null },
  today: Date,
) {
  const st = String(gate.status || "").toLowerCase();
  if (/approved|complete|completed|passed|closed/.test(st)) return false;
  const planned = String(gate.planned_date || "").slice(0, 10);
  const actual = String(gate.actual_date || "").slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  if (planned && actual && actual > planned) return true;
  if (planned && !actual && planned < todayIso) return true;
  return false;
}

function isOpenRaid(status?: string | null) {
  const s = String(status || "").toLowerCase();
  return !/closed|mitigated|accepted|resolved|done|completed|met/.test(s);
}

function isCriticalRisk(r: BriefingRisk) {
  if (num(r.severity) >= 12) return true;
  return num(r.probability) * num(r.impact) >= 12;
}

function isHighIssue(i: FocusIssue) {
  const p = String(i.priority || "").toLowerCase();
  return num(i.escalation_level) > 0 || /critical|high|p1|red/.test(p);
}

function isHighPriorityProject(p: BriefingProject) {
  return /p1|critical|high/i.test(String(p.priority || ""));
}

function money(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}K`;
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}

export function criticalityFromScore(score: number): FocusCriticality | "Stable" {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Watch";
  return "Stable";
}

export function parseFocusWeights(raw: unknown): FocusWeights {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nested =
    src.executive_focus && typeof src.executive_focus === "object"
      ? (src.executive_focus as Record<string, unknown>)
      : src;
  const w = (nested.weights && typeof nested.weights === "object" ? nested.weights : nested) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_FOCUS_WEIGHTS };
  for (const key of Object.keys(out) as (keyof FocusWeights)[]) {
    if (w[key] != null && Number.isFinite(Number(w[key]))) out[key] = Number(w[key]);
  }
  return out;
}

function scoreParts(
  weights: FocusWeights,
  parts: Partial<Record<keyof FocusWeights, number>>,
) {
  let total = 0;
  let max = 0;
  for (const key of Object.keys(weights) as (keyof FocusWeights)[]) {
    max += weights[key];
    total += weights[key] * Math.min(1, Math.max(0, parts[key] ?? 0));
  }
  return Math.round((total / Math.max(max, 1)) * 100);
}

function itemCriticality(score: number, force?: FocusCriticality): FocusCriticality {
  if (force) return force;
  const band = criticalityFromScore(score);
  return band === "Stable" ? "Watch" : band;
}

function emptyAreas(): Record<FocusArea, FocusItem[]> {
  return {
    delivery: [],
    financial: [],
    resource: [],
    risk: [],
    decision: [],
    dependency: [],
    benefit: [],
  };
}

export function buildExecutiveFocus(opts: {
  projects: BriefingProject[];
  gates?: BriefingGate[];
  risks?: BriefingRisk[];
  issues?: FocusIssue[];
  decisions?: BriefingDecision[];
  dependencies?: FocusDependency[];
  allocations?: CapacityAllocation[];
  resources?: CapacityResource[];
  workItems?: HealthEngineInput["workItems"];
  monthly?: HealthEngineInput["monthly"];
  benefitLines?: HealthEngineInput["benefitLines"];
  fyAllocations?: HealthEngineInput["fyAllocations"];
  fyStartMonth?: number | null;
  weights?: FocusWeights | unknown;
  now?: Date;
}): FocusResult {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const weights = parseFocusWeights(opts.weights ?? DEFAULT_FOCUS_WEIGHTS);
  const byId = new Map(opts.projects.map((p) => [p.id, p]));
  const ids = new Set(opts.projects.map((p) => p.id));

  const gates = (opts.gates ?? []).filter((g) => ids.has(g.project_id));
  const risks = (opts.risks ?? []).filter((r) => ids.has(r.project_id) && isOpenRaid(r.status));
  const issues = (opts.issues ?? []).filter((i) => ids.has(i.project_id) && isOpenRaid(i.status));
  const decisions = (opts.decisions ?? []).filter((d) => ids.has(d.project_id) && isDecisionAwaiting(d));
  const deps = (opts.dependencies ?? []).filter(
    (d) => ids.has(d.project_id) || (d.depends_on_project_id && ids.has(d.depends_on_project_id)),
  );

  const healthByProject = new Map<string, HealthEngineResult>();
  for (const p of opts.projects) {
    healthByProject.set(
      p.id,
      evaluateProjectHealth({
        project: p,
        gates: gates.filter((g) => g.project_id === p.id),
        risks: risks.filter((r) => r.project_id === p.id),
        monthly: (opts.monthly ?? []).filter((m) => (m as { project_id?: string }).project_id === p.id),
        workItems: (opts.workItems ?? []).filter((w) => w.project_id === p.id),
        allocations: (opts.allocations ?? []).filter((a) => a.project_id === p.id),
        benefitLines: (opts.benefitLines ?? []).filter(
          (b) => (b as { project_id?: string }).project_id === p.id,
        ),
        fyAllocations: (opts.fyAllocations ?? []).filter(
          (a) => (a as { project_id?: string }).project_id === p.id,
        ),
        fyStartMonth: opts.fyStartMonth,
        nowMs: now.getTime(),
      }),
    );
  }

  const items: FocusItem[] = [];

  const downstream = new Map<string, Set<string>>();
  for (const d of deps) {
    if (!d.depends_on_project_id || !d.project_id) continue;
    const set = downstream.get(d.depends_on_project_id) || new Set<string>();
    set.add(d.project_id);
    downstream.set(d.depends_on_project_id, set);
  }

  for (const p of opts.projects) {
    if (/completed|cancelled|on hold/i.test(String(p.status || ""))) continue;
    const engine = healthByProject.get(p.id)!;
    const budget = projectApprovedFunding(p);
    const fac = projectForecast(p);
    const incurred = projectIncurred(p);
    const overrun = fac - budget;
    const actualOver = incurred - budget;
    const lateGates = gates.filter((g) => g.project_id === p.id && isGateScheduleDelayed(g, now));
    const critRisks = risks.filter((r) => r.project_id === p.id && isCriticalRisk(r));
    const benefitTarget = projectBenefitsTarget(p);
    const benefitRealised = projectBenefitsRealised(p);
    const benefitGap = Math.max(0, benefitTarget - benefitRealised);
    const baseline = isoDay(p.planned_end_date) || isoDay(p.end_date);
    const forecastEnd = projectScheduleEnd(p);
    const start = projectScheduleStart(p);
    const daysBehind =
      baseline && forecastEnd && forecastEnd > baseline ? daysBetween(baseline, forecastEnd) : 0;
    const daysPastEnd = baseline && baseline < today && !p.actual_end_date ? daysBetween(baseline, today) : 0;
    const delayDays = Math.max(daysBehind, daysPastEnd);
    const impacted = downstream.get(p.id)?.size ?? 0;
    const material =
      overrun > Math.max(10_000, budget * 0.02) ||
      actualOver > 0 ||
      lateGates.length > 0 ||
      critRisks.length > 0 ||
      benefitGap > Math.max(50_000, benefitTarget * 0.15) ||
      impacted >= 2 ||
      isHighPriorityProject(p);

    if (delayDays >= 5) {
      const lateGate = lateGates[0];
      const why =
        lateGate
          ? `${lateGate.gate_name || "Stage gate"} missed ${isoDay(lateGate.planned_date) || "its planned date"}`
          : critRisks[0]
            ? raidLabel(critRisks[0], "Critical risk")
            : engine.earlyWarnings[0]?.title || "Forecast finish is behind the baseline";
      const impact = material
        ? forecastEnd && baseline
          ? `Go-live moves from ${baseline} to ${forecastEnd} (${delayDays} days)`
          : `${delayDays} days behind the baseline with portfolio impact`
        : `${delayDays} days behind — no material financial, benefit, or dependency impact flagged`;
      const score = scoreParts(weights, {
        businessImpact: material ? 0.85 : 0.2,
        financialImpact: overrun > 0 ? Math.min(1, overrun / Math.max(budget, 1) / 0.15) : 0.1,
        scheduleImpact: Math.min(1, delayDays / 30),
        urgency: delayDays >= 14 ? 0.8 : 0.4,
        multiProject: Math.min(1, impacted / 4),
        execIntervention: material ? 0.7 : 0.15,
        riskSeverity: critRisks.length ? 0.7 : 0.1,
        customerImpact: isHighPriorityProject(p) ? 0.6 : 0.2,
      });
      if (material || delayDays >= 21) {
        items.push({
          id: `delivery-${p.id}`,
          area: "delivery",
          criticality: itemCriticality(score, material && delayDays >= 14 ? "Critical" : undefined),
          score,
          title: labelOf(p),
          headline: `${delayDays} days delayed`,
          why,
          impact,
          action: lateGate
            ? "Rebaseline the gate or stop the lane until the pack is ready"
            : "Confirm the recovery plan and a new finish date",
          owner: ownerOf(p),
          dueDate: lateGate ? isoDay(lateGate.planned_date) : baseline,
          daysRemaining: baseline ? daysBetween(today, baseline) : null,
          projectId: p.id,
          projectLabel: labelOf(p),
          link: { kind: "project", projectId: p.id, tab: "overview", label: "View project" },
          subtype: lateGate ? "gate" : "delay",
          projectsImpacted: impacted || undefined,
        });
      }
    }

    const burn = engine.forecast.burnRatePerWeek;
    const elapsedWeeks =
      start && today > start ? Math.max(1, daysBetween(start, today) / 7) : 0;
    const remainingWeeks =
      forecastEnd && forecastEnd > today ? Math.max(1, daysBetween(today, forecastEnd) / 7) : 0;
    const burnOutlook = burn && remainingWeeks ? incurred + burn * remainingWeeks : fac;
    const burnAnomaly = budget > 0 && burnOutlook > fac * 1.05 && burnOutlook - budget > 10_000;

    let financeKind: "actual" | "forecast" | "burn" | "funding" | null = null;
    if (actualOver > 1000) financeKind = "actual";
    else if (burnAnomaly) financeKind = "burn";
    else if (overrun > Math.max(10_000, budget * 0.02)) financeKind = "forecast";
    else if (overrun > 0 && engine.forecast.source !== "approved") financeKind = "funding";

    if (financeKind) {
      const variancePct = budget > 0 ? overrun / budget : 0;
      const exposure = Math.max(overrun, actualOver, 0);
      const score = scoreParts(weights, {
        businessImpact: 0.7,
        financialImpact: Math.min(1, Math.max(variancePct / 0.1, exposure / 500_000)),
        scheduleImpact: delayDays ? Math.min(1, delayDays / 30) : 0.2,
        urgency: financeKind === "actual" ? 0.9 : 0.65,
        multiProject: 0.15,
        execIntervention: variancePct >= 0.05 ? 0.85 : 0.5,
        riskSeverity: 0.2,
        customerImpact: isHighPriorityProject(p) ? 0.5 : 0.2,
      });
      const headline =
        financeKind === "actual"
          ? `${money(actualOver)} actual overrun`
          : financeKind === "burn"
            ? `Burn rate points to ${money(burnOutlook - budget)} overrun`
            : `${money(overrun)} forecast overrun`;
      items.push({
        id: `financial-${p.id}`,
        area: "financial",
        criticality: itemCriticality(score, variancePct >= 0.05 || financeKind === "actual" ? "Critical" : undefined),
        score,
        title: labelOf(p),
        headline,
        why:
          financeKind === "burn"
            ? `Weekly burn ${money(burn || 0)} over ${elapsedWeeks.toFixed(0)} weeks is ahead of the FAC path`
            : engine.forecast.message || `FAC ${money(fac)} vs approved ${money(budget)}`,
        impact: `${money(exposure)} above envelope · ${Math.round(variancePct * 100)}% variance`,
        action: financeKind === "actual" || variancePct >= 0.05
          ? "Additional funding approval required"
          : "Confirm the FAC path or pull scope back to the envelope",
        owner: ownerOf(p),
        dueDate: null,
        daysRemaining: null,
        projectId: p.id,
        projectLabel: labelOf(p),
        amount: exposure,
        link: { kind: "financials", projectId: p.id, label: "View financials" },
        subtype: financeKind,
      });
    }

    if (benefitTarget >= 50_000) {
      const schedulePct = Math.max(0.05, Math.min(1, engine.schedulePct / 100 || 0.3));
      const expectedToDate = benefitTarget * schedulePct;
      const atRisk =
        benefitGap >= Math.max(50_000, benefitTarget * 0.15) &&
        (benefitRealised < expectedToDate * 0.7 || engine.rag !== "Green");
      if (atRisk) {
        const score = scoreParts(weights, {
          businessImpact: 0.9,
          financialImpact: Math.min(1, benefitGap / Math.max(benefitTarget, 1)),
          scheduleImpact: delayDays ? 0.5 : 0.25,
          urgency: 0.55,
          multiProject: 0.1,
          execIntervention: 0.6,
          riskSeverity: 0.2,
          customerImpact: 0.7,
        });
        items.push({
          id: `benefit-${p.id}`,
          area: "benefit",
          criticality: itemCriticality(score),
          score,
          title: labelOf(p),
          headline: `${money(benefitGap)} benefits gap`,
          why: `Realised ${money(benefitRealised)} vs target ${money(benefitTarget)}`,
          impact: `Expected to-date ~${money(expectedToDate)} · outcome at risk`,
          action: "Confirm the benefit path or reset the business case",
          owner: ownerOf(p),
          dueDate: forecastEnd,
          daysRemaining: forecastEnd ? daysBetween(today, forecastEnd) : null,
          projectId: p.id,
          projectLabel: labelOf(p),
          amount: benefitGap,
          link: { kind: "benefits", projectId: p.id, label: "View benefits" },
        });
      }
    }
  }

  for (const r of risks.filter(isCriticalRisk)) {
    const p = byId.get(r.project_id);
    if (!p) continue;
    const score = scoreParts(weights, {
      businessImpact: 0.75,
      financialImpact: 0.35,
      scheduleImpact: 0.4,
      urgency: 0.7,
      multiProject: 0.2,
      execIntervention: 0.85,
      riskSeverity: Math.min(1, num(r.severity) / 16 || 0.8),
      customerImpact: isHighPriorityProject(p) ? 0.5 : 0.25,
    });
    items.push({
      id: `risk-${r.id}`,
      area: "risk",
      criticality: itemCriticality(score, "Critical"),
      score,
      title: raidLabel(r, "Critical risk"),
      headline: `Severity ${r.severity ?? (num(r.probability) * num(r.impact) || "—")}`,
      why: "Exceeds project-level authority — still open",
      impact: `${labelOf(p)} · ${ownerOf(p)}`,
      action: "Accept, fund mitigation, or escalate today",
      owner: String(r.owner || ownerOf(p)),
      dueDate: null,
      daysRemaining: null,
      projectId: p.id,
      projectLabel: labelOf(p),
      link: { kind: "risks", projectId: p.id, label: "View risk" },
      subtype: "risk",
    });
  }

  for (const issue of issues.filter(isHighIssue)) {
    const p = byId.get(issue.project_id);
    if (!p) continue;
    const due = isoDay(issue.target_date);
    const overdue = !!(due && due < today);
    const score = scoreParts(weights, {
      businessImpact: 0.7,
      financialImpact: 0.25,
      scheduleImpact: overdue ? 0.6 : 0.35,
      urgency: overdue || num(issue.escalation_level) > 0 ? 0.85 : 0.55,
      multiProject: 0.15,
      execIntervention: 0.8,
      riskSeverity: 0.65,
      customerImpact: 0.3,
    });
    items.push({
      id: `issue-${issue.id}`,
      area: "risk",
      criticality: itemCriticality(score, overdue || num(issue.escalation_level) > 0 ? "Critical" : "High"),
      score,
      title: raidLabel(issue, "Critical issue"),
      headline: overdue ? "Overdue issue" : issue.escalation_reason?.trim() || "Escalated issue",
      why: String(issue.escalation_reason || issue.priority || "Requires executive visibility"),
      impact: labelOf(p),
      action: "Intervene or re-date the resolution",
      owner: String(issue.owner || ownerOf(p)),
      dueDate: due,
      daysRemaining: due ? daysBetween(today, due) : null,
      projectId: p.id,
      projectLabel: labelOf(p),
      link: { kind: "issues", projectId: p.id, label: "View issue" },
      subtype: "issue",
    });
  }

  for (const d of decisions) {
    const p = byId.get(d.project_id);
    if (!p) continue;
    const due = isoDay(d.required_date);
    const overdue = !!(due && due < today);
    const remaining = due ? daysBetween(today, due) : null;
    const score = scoreParts(weights, {
      businessImpact: 0.7,
      financialImpact: 0.25,
      scheduleImpact: 0.35,
      urgency: overdue ? 1 : remaining != null && remaining <= 7 ? 0.8 : 0.5,
      multiProject: 0.15,
      execIntervention: 1,
      riskSeverity: 0.2,
      customerImpact: 0.3,
    });
    items.push({
      id: `decision-${d.id}`,
      area: "decision",
      criticality: itemCriticality(score, overdue ? "Critical" : "High"),
      score: overdue ? Math.max(score, 82) : score,
      title: raidLabel(d, "Decision required"),
      headline: overdue ? `Overdue${due ? ` since ${due}` : ""}` : due ? `Required by ${due}` : "No required date",
      why: "Awaiting an executive outcome",
      impact: labelOf(p),
      action: d.recommendation?.trim() || "Approve, reject, or send back with a date",
      owner: ownerOf(p),
      dueDate: due,
      daysRemaining: remaining,
      projectId: p.id,
      projectLabel: labelOf(p),
      link: { kind: "decisions", projectId: p.id, label: "Open decision" },
      subtype: overdue ? "overdue" : "waiting",
    });
  }

  for (const d of deps.filter((x) => isOpenRaid(x.status))) {
    const dependent = byId.get(d.project_id);
    const predecessor = d.depends_on_project_id ? byId.get(d.depends_on_project_id) : undefined;
    if (!dependent && !predecessor) continue;
    const needed = isoDay(d.needed_by);
    const delayed = !!(needed && needed < today);
    const predEnd = predecessor ? projectScheduleEnd(predecessor) : null;
    const slip = needed && predEnd && predEnd > needed ? daysBetween(needed, predEnd) : delayed && needed ? daysBetween(needed, today) : 0;
    const impacted = d.depends_on_project_id ? downstream.get(d.depends_on_project_id)?.size ?? 1 : 1;
    if (!delayed && slip < 5 && impacted < 2) continue;
    if (slip < 1 && impacted < 2) continue;
    const score = scoreParts(weights, {
      businessImpact: 0.7,
      financialImpact: 0.25,
      scheduleImpact: Math.min(1, slip / 20),
      urgency: delayed ? 0.8 : 0.45,
      multiProject: Math.min(1, impacted / 4),
      execIntervention: impacted >= 2 ? 0.7 : 0.35,
      riskSeverity: 0.3,
      customerImpact: 0.25,
    });
    const from = predecessor ? labelOf(predecessor) : "Upstream";
    const to = dependent ? labelOf(dependent) : "Downstream";
    items.push({
      id: `dep-${d.id}`,
      area: "dependency",
      criticality: itemCriticality(score, impacted >= 3 || slip >= 10 ? "Critical" : undefined),
      score,
      title: d.title?.trim() || `${from} → ${to}`,
      headline: slip > 0 ? `${slip}-day dependency delay` : `${impacted} projects linked`,
      why: d.description?.trim() || `Needed ${needed || "—"} · forecast ${predEnd || "—"}`,
      impact: `${impacted} project${impacted === 1 ? "" : "s"} potentially impacted`,
      action: "Re-sequence the successor or recover the predecessor date",
      owner: String(d.owner || (predecessor ? ownerOf(predecessor) : "Unassigned")),
      dueDate: needed,
      daysRemaining: needed ? daysBetween(today, needed) : null,
      projectId: dependent?.id || predecessor?.id || null,
      projectLabel: dependent ? labelOf(dependent) : from,
      projectsImpacted: impacted,
      link: { kind: "dependencies", projectId: dependent?.id || predecessor?.id, label: "View dependency" },
    });
  }

  const capacity =
    opts.resources?.length && opts.allocations?.length
      ? computeCapacityGap({
          month,
          resources: opts.resources,
          allocations: opts.allocations.filter((a) => ids.has(a.project_id)),
        })
      : null;
  if (capacity) {
    for (const row of capacity.bySkill.filter((s) => s.gapFte >= 0.5).slice(0, 6)) {
      const skillAlloc = (opts.allocations ?? []).filter((a) => {
        if (!ids.has(a.project_id) || String(a.period_month || "").slice(0, 7) !== month) return false;
        const res = opts.resources?.find((r) => r.id === a.resource_id);
        const bag = `${res?.skills || ""} ${res?.role || ""}`.toLowerCase();
        return bag.includes(row.skill.toLowerCase());
      });
      const projectIds = [...new Set(skillAlloc.map((a) => a.project_id))];
      const first = byId.get(projectIds[0] || "");
      const score = scoreParts(weights, {
        businessImpact: 0.65,
        financialImpact: 0.2,
        scheduleImpact: 0.55,
        urgency: 0.6,
        multiProject: Math.min(1, projectIds.length / 4),
        execIntervention: 0.55,
        riskSeverity: 0.2,
        customerImpact: 0.25,
      });
      items.push({
        id: `resource-${row.skill}`,
        area: "resource",
        criticality: itemCriticality(score, row.gapFte >= 2 ? "Critical" : undefined),
        score,
        title: `${row.skill} capability`,
        headline: `${row.gapFte} FTE shortage`,
        why: `Required ${row.requiredFte} FTE · available ${row.availableFte} FTE`,
        impact: `${projectIds.length || 1} project${(projectIds.length || 1) === 1 ? "" : "s"} impacted`,
        action: "Hire, borrow, or re-sequence work around the gap",
        owner: first ? ownerOf(first) : "Resource manager",
        dueDate: `${month}-01`,
        daysRemaining: daysBetween(today, `${month}-28`),
        projectId: first?.id || null,
        projectLabel: first ? labelOf(first) : "Portfolio",
        projectsImpacted: projectIds.length || undefined,
        link: { kind: "resources", projectId: first?.id, label: "View resource demand" },
      });
    }
  }

  items.sort((a, b) => {
    const rank = (c: FocusCriticality) => (c === "Critical" ? 0 : c === "High" ? 1 : 2);
    if (rank(a.criticality) !== rank(b.criticality)) return rank(a.criticality) - rank(b.criticality);
    if (b.score !== a.score) return b.score - a.score;
    return (b.amount || 0) - (a.amount || 0);
  });

  const seen = new Set<string>();
  const unique: FocusItem[] = [];
  for (const item of items) {
    const key = `${item.area}:${item.projectId || item.id}:${item.headline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const byArea = emptyAreas();
  for (const item of unique) byArea[item.area].push(item);

  const projectBest = new Map<string, number>();
  for (const item of unique) {
    if (!item.projectId) continue;
    projectBest.set(item.projectId, Math.max(projectBest.get(item.projectId) || 0, item.score));
  }
  const projectScores: FocusProjectScore[] = opts.projects.map((p) => {
    const engine = healthByProject.get(p.id);
    const base = projectBest.get(p.id) || 0;
    const bump = engine?.rag === "Red" ? 8 : engine?.rag === "Amber" ? 3 : 0;
    const score = Math.min(100, base + (base ? bump : 0));
    return {
      projectId: p.id,
      projectLabel: labelOf(p),
      score,
      criticality: criticalityFromScore(score),
    };
  });

  const scoredItems = unique.filter((i) => i.criticality !== undefined);
  const summary: FocusSummary = {
    critical: scoredItems.filter((i) => i.criticality === "Critical").length,
    high: scoredItems.filter((i) => i.criticality === "High").length,
    watch: scoredItems.filter((i) => i.criticality === "Watch").length,
    decisionsRequired: byArea.decision.length,
    deliveryIssues: byArea.delivery.length,
    financialExposure: byArea.financial.reduce((s, i) => s + Math.max(0, i.amount || 0), 0),
    fteGap: Math.max(0, capacity?.gapFte || 0),
    criticalDependencies: byArea.dependency.filter((i) => i.criticality === "Critical" || (i.projectsImpacted || 0) >= 2).length,
    benefitsAtRisk: byArea.benefit.length,
  };

  return {
    summary,
    top: unique.slice(0, 5),
    byArea,
    projectScores,
  };
}

export function focusAreaCounts(result: FocusResult) {
  return AREAS.map((area) => ({
    area,
    label: FOCUS_AREA_LABEL[area],
    count: result.byArea[area].length,
    critical: result.byArea[area].filter((i) => i.criticality === "Critical").length,
  }));
}
