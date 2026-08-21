/**
 * Project Health Engine — weighted score, drivers, early warnings,
 * 30-day predictive health, and burn-rate cost forecasting.
 *
 * Does not require PMs to enter RAG; RAG is derived from the score.
 * Manual `projects.rag` remains available as an optional override display.
 */

import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  sumBenefitsRealised,
  sumBenefitsTarget,
  type BenefitLineLike,
  type FyAllocationLike,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import {
  fyEnvelopeOverAllocation,
  fyYearWatches,
  worstFyOverAllocation,
} from "@/lib/fy-allocation-scope";
import {
  parentEnvelopeStatus,
  type ParentEnvelopeWatch,
} from "@/lib/hierarchy-envelope";
import { projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import {
  computeProjectEvm,
  workItemPctComplete,
  type EvmMonthlyLike,
  type EvmWorkItemLike,
} from "@/lib/evm";

export type RagTone = "Green" | "Amber" | "Red";

export const HEALTH_DIMENSION_WEIGHTS = {
  schedule: 0.2,
  financial: 0.2,
  scope: 0.1,
  delivery: 0.15,
  resource: 0.1,
  risk: 0.1,
  dependencies: 0.1,
  benefits: 0.05,
} as const;

export type HealthDimensionKey = keyof typeof HEALTH_DIMENSION_WEIGHTS;

export const HEALTH_DIMENSION_LABELS: Record<HealthDimensionKey, string> = {
  schedule: "Schedule",
  financial: "Financial",
  scope: "Scope",
  delivery: "Delivery",
  resource: "Resource",
  risk: "Risk",
  dependencies: "Dependencies",
  benefits: "Benefits",
};

/** Score → RAG bands (matches product examples: 87 Green / 72 Amber / 58 Red). */
export function scoreToRag(score: number): RagTone {
  if (score >= 80) return "Green";
  if (score >= 65) return "Amber";
  return "Red";
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type HealthRiskLike = {
  status?: string | null;
  priority?: string | null;
  rating?: string | null;
  residual_rating?: string | null;
  severity?: number | null;
  probability?: number | null;
  impact?: number | null;
};

export type HealthDependencyLike = {
  status?: string | null;
  rag?: string | null;
  due_date?: string | null;
  needed_by?: string | null;
  dependency_type?: string | null;
  dep_type?: string | null;
};

export type HealthChangeRequestLike = {
  status?: string | null;
  change_type?: string | null;
  impact_cost?: number | null;
  impact_schedule_days?: number | null;
};

export type HealthAllocationLike = {
  allocation_pct?: number | null;
  allocation_percent?: number | null;
  hours_per_week?: number | null;
  allocated_hours?: number | null;
  fte?: number | null;
};

export type HealthGateLike = {
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
};

export type HealthEngineInput = {
  project: ProjectFinanceLike & {
    id?: string;
    name?: string | null;
    project_code?: string | null;
    rag?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    baseline_budget?: number | null;
    baseline_capex?: number | null;
    baseline_opex?: number | null;
    baseline_date?: string | null;
    baseline_label?: string | null;
    forecast_at_completion?: number | null;
  };
  workItems?: EvmWorkItemLike[];
  gates?: HealthGateLike[];
  risks?: HealthRiskLike[];
  dependencies?: HealthDependencyLike[];
  changeRequests?: HealthChangeRequestLike[];
  allocations?: HealthAllocationLike[];
  monthly?: EvmMonthlyLike[];
  /** FY Allocation rows — year slices of the project envelope. */
  fyAllocations?: FyAllocationLike[];
  /** Org FY start month (1–12). Used to map monthly cashflow onto FY labels. */
  fyStartMonth?: number | null;
  /** Benefits register lines — canonical target/realised (same as Cockpit). */
  benefitLines?: BenefitLineLike[];
  /**
   * Optional Strategic Alignment / Program pots. Warnings only — does not
   * change this project's financial dimension score.
   */
  parentEnvelopes?: ParentEnvelopeWatch[];
  /** Prior health score (e.g. last visit) for “dropped 82 → 72” copy. */
  previousScore?: number | null;
  nowMs?: number;
};

export type DimensionScore = {
  key: HealthDimensionKey;
  label: string;
  weight: number;
  score: number;
  rag: RagTone;
  detail: string;
};

export type HealthDriver = {
  dimension: HealthDimensionKey;
  label: string;
  severity: RagTone;
  message: string;
  scoreImpact: number;
};

export type EarlyWarning = {
  code: string;
  title: string;
  message: string;
  potentialDelayWeeks: number | null;
  potentialCostImpact: number | null;
  recommendedAction: string;
  severity: RagTone;
};

export type PredictiveHealth = {
  currentScore: number;
  forecastScore30d: number;
  confidencePct: number;
  likelyRag: RagTone;
  warning: string | null;
};

export type AutomatedForecast = {
  approvedBudget: number;
  actual: number;
  remainingApproved: number;
  burnRatePerWeek: number | null;
  forecastFinalCost: number;
  overrun: number;
  source: "evm_eac" | "burn_rate" | "stated_fac" | "approved";
  message: string;
};

export type HealthEngineResult = {
  score: number;
  rag: RagTone;
  previousScore: number | null;
  scoreDelta: number | null;
  dimensions: DimensionScore[];
  drivers: HealthDriver[];
  earlyWarnings: EarlyWarning[];
  predictive: PredictiveHealth;
  forecast: AutomatedForecast;
  workPct: number;
  schedulePct: number;
  ftePlanPct: number;
  fteActualPct: number;
};

function isOpenRisk(r: HealthRiskLike): boolean {
  const s = String(r.status || "").toLowerCase();
  return !/closed|mitigated|accepted|resolved/.test(s);
}

function isCriticalRisk(r: HealthRiskLike): boolean {
  const p = String(r.priority || r.rating || r.residual_rating || "").toLowerCase();
  if (p.includes("critical") || p.includes("very high") || p === "red") return true;
  if (num(r.severity) >= 12) return true;
  const score = num(r.probability) * num(r.impact);
  return score >= 15;
}

function isOpenCr(c: HealthChangeRequestLike): boolean {
  const s = String(c.status || "").toLowerCase();
  return !/approved|rejected|closed|cancelled|implemented/.test(s);
}

function isOpenDep(d: HealthDependencyLike): boolean {
  const s = String(d.status || "").toLowerCase();
  return !/closed|resolved|complete|completed|met/.test(s);
}

function overdueGateDays(gates: HealthGateLike[], nowMs: number): number {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  let max = 0;
  for (const g of gates) {
    if (!g.planned_date) continue;
    const st = String(g.status || "").toLowerCase();
    if (/approved|complete|completed|passed/.test(st)) continue;
    const planned = new Date(g.planned_date);
    if (Number.isNaN(planned.getTime())) continue;
    planned.setHours(0, 0, 0, 0);
    if (planned >= today) continue;
    const days = Math.round((today.getTime() - planned.getTime()) / 86_400_000);
    if (days > max) max = days;
  }
  return max;
}

function scoreSchedule(workPct: number, schedulePct: number): { score: number; detail: string } {
  if (schedulePct <= 0.02 && workPct <= 0.02) {
    return { score: 88, detail: "Project early — insufficient schedule signal yet" };
  }
  const variance = workPct - schedulePct; // negative = behind
  // 0 variance → ~95; -10pp → ~75; -20pp → ~55; -30pp → ~35
  const score = clamp(95 + variance * 200);
  const pctBehind = Math.round(Math.max(0, -variance) * 100);
  return {
    score,
    detail:
      pctBehind > 0
        ? `Work ${Math.round(workPct * 100)}% vs schedule ${Math.round(schedulePct * 100)}% (${pctBehind}pp behind)`
        : `Work ${Math.round(workPct * 100)}% vs schedule ${Math.round(schedulePct * 100)}%`,
  };
}

function scoreFinancial(approved: number, forecast: number, actual: number): {
  score: number;
  detail: string;
} {
  if (approved <= 0) {
    if (actual > 0 || forecast > 0) return { score: 55, detail: "Spend without approved funding baseline" };
    return { score: 85, detail: "No approved funding baseline" };
  }
  const fac = Math.max(forecast, actual);
  const overrunPct = (fac - approved) / approved;
  const score = clamp(100 - Math.max(0, overrunPct) * 250);
  return {
    score,
    detail:
      overrunPct > 0.01
        ? `FAC ${Math.round(fac).toLocaleString()} vs approved ${Math.round(approved).toLocaleString()} (+${Math.round(overrunPct * 100)}%)`
        : `FAC within approved funding (${Math.round((actual / approved) * 100)}% consumed)`,
  };
}

function mergeFinancialDetail(
  current: { score: number; detail: string },
  next: { score: number; detail: string },
): { score: number; detail: string } {
  const score = Math.min(current.score, next.score);
  if (!next.detail || current.detail.includes(next.detail)) return { ...current, score };
  if (!current.detail) return { score, detail: next.detail };
  return { score, detail: `${current.detail} · ${next.detail}` };
}

function scoreFinancialFyAllocation(
  lifetime: { score: number; detail: string },
  watches: ReturnType<typeof fyYearWatches>,
  overall: number,
  allocations: FyAllocationLike[],
): { score: number; detail: string } {
  let result = lifetime;
  const envelope = fyEnvelopeOverAllocation({ allocations, overallBudget: overall });
  if (envelope) {
    result = mergeFinancialDetail(result, {
      score: scoreFinancial(envelope.overall, envelope.allocated, 0).score,
      detail: `FY allocations $${Math.round(envelope.allocated).toLocaleString()} exceed overall budget $${Math.round(envelope.overall).toLocaleString()} (+${Math.round((envelope.overBy / envelope.overall) * 100)}%)`,
    });
  }
  const worst = worstFyOverAllocation(watches);
  if (!worst || worst.allocation <= 0) return result;
  if (worst.overBy > 0) {
    const fy = scoreFinancial(worst.allocation, worst.peak, worst.actual);
    const detail = `${worst.fy} ${worst.peakSource} $${Math.round(worst.peak).toLocaleString()} exceeds FY allocation $${Math.round(worst.allocation).toLocaleString()} (+${Math.round((worst.overBy / worst.allocation) * 100)}%)`;
    result = mergeFinancialDetail(result, { score: fy.score, detail });
  }
  const capexPeak = Math.max(worst.planCapex, worst.actualCapex, worst.forecastCapex);
  if (worst.capexOverBy > 0 && worst.allocCapex > 0) {
    const fy = scoreFinancial(worst.allocCapex, capexPeak, worst.actualCapex);
    const detail = `${worst.fy} CapEx $${Math.round(capexPeak).toLocaleString()} exceeds FY CapEx allocation $${Math.round(worst.allocCapex).toLocaleString()}`;
    result = mergeFinancialDetail(result, { score: fy.score, detail });
  }
  const opexPeak = Math.max(worst.planOpex, worst.actualOpex, worst.forecastOpex);
  if (worst.opexOverBy > 0 && worst.allocOpex > 0) {
    const fy = scoreFinancial(worst.allocOpex, opexPeak, worst.actualOpex);
    const detail = `${worst.fy} OpEx $${Math.round(opexPeak).toLocaleString()} exceeds FY OpEx allocation $${Math.round(worst.allocOpex).toLocaleString()}`;
    result = mergeFinancialDetail(result, { score: fy.score, detail });
  }
  return result;
}

function scoreScope(items: EvmWorkItemLike[], crs: HealthChangeRequestLike[]): {
  score: number;
  detail: string;
} {
  const active = items.filter((i) => !/cancelled/i.test(String(i.status || "")));
  const blocked = active.filter((i) => /blocked/i.test(String(i.status || ""))).length;
  const openCrs = crs.filter(isOpenCr);
  const scopeCrs = openCrs.filter((c) => /scope/i.test(String(c.change_type || "")));
  let score = 92;
  if (active.length) score -= (blocked / active.length) * 40;
  score -= Math.min(35, openCrs.length * 8);
  score -= Math.min(20, scopeCrs.length * 10);
  const parts: string[] = [];
  if (blocked) parts.push(`${blocked} blocked work item(s)`);
  if (openCrs.length) parts.push(`${openCrs.length} open change request(s)`);
  return {
    score: clamp(score),
    detail: parts.length ? parts.join(" · ") : "Scope stable — no open blockers/CRs",
  };
}

function scoreDelivery(
  workPct: number,
  gateLateDays: number,
  items: EvmWorkItemLike[],
): { score: number; detail: string } {
  const active = items.filter((i) => !/cancelled/i.test(String(i.status || "")));
  const done = active.filter((i) => /done/i.test(String(i.status || ""))).length;
  let score = 90;
  if (gateLateDays >= 15) score -= 35;
  else if (gateLateDays >= 1) score -= 15;
  if (active.length) {
    const doneRate = done / active.length;
    score = score * 0.55 + doneRate * 100 * 0.45;
  } else {
    score = score * 0.7 + workPct * 100 * 0.3;
  }
  return {
    score: clamp(score),
    detail:
      gateLateDays > 0
        ? `Stage gate overdue ${gateLateDays}d · work ${Math.round(workPct * 100)}% complete`
        : `Delivery on track · ${done}/${active.length || 0} work items done`,
  };
}

function scoreResource(
  allocations: HealthAllocationLike[],
  ftePlan: number,
  fteActual: number,
): { score: number; detail: string } {
  const util =
    allocations.length > 0
      ? allocations.reduce(
          (s, a) =>
            s +
            Math.max(
              num(a.allocation_pct),
              num(a.allocation_percent),
              num(a.fte) * 100,
              num(a.allocated_hours) > 0 ? Math.min(150, (num(a.allocated_hours) / 40) * 100) : 0,
              0,
            ),
          0,
        ) / Math.max(1, allocations.length)
      : ftePlan > 0
        ? (fteActual / ftePlan) * 100
        : 0;

  if (!allocations.length && ftePlan <= 0) {
    return { score: 80, detail: "No resource plan signal yet" };
  }

  // Ideal band ~70–95%. Over 100% or under 40% hurts.
  let score = 90;
  if (util > 110) score = 40;
  else if (util > 100) score = 55;
  else if (util > 95) score = 72;
  else if (util < 40 && util > 0) score = 65;
  else if (util <= 0) score = 75;

  return {
    score: clamp(score),
    detail:
      util > 0
        ? `Resource utilisation ~${Math.round(util)}%${ftePlan > 0 ? ` · FTE $ ${Math.round(fteActual).toLocaleString()} / ${Math.round(ftePlan).toLocaleString()}` : ""}`
        : "Resource utilisation not yet measurable",
  };
}

function scoreRisk(risks: HealthRiskLike[]): { score: number; detail: string } {
  const open = risks.filter(isOpenRisk);
  const critical = open.filter(isCriticalRisk);
  let score = 95 - open.length * 4 - critical.length * 12;
  return {
    score: clamp(score),
    detail:
      critical.length || open.length
        ? `${critical.length} critical · ${open.length} open risk(s)`
        : "No open risks",
  };
}

function scoreDependencies(deps: HealthDependencyLike[], nowMs: number): {
  score: number;
  detail: string;
} {
  const open = deps.filter(isOpenDep);
  const today = nowMs;
  const overdue = open.filter((d) => {
    const due = d.due_date || d.needed_by;
    if (!due) return /red|amber/i.test(String(d.rag || ""));
    return new Date(due).getTime() < today;
  });
  let score = 94 - open.length * 5 - overdue.length * 10;
  return {
    score: clamp(score),
    detail:
      open.length
        ? `${open.length} open dependenc${open.length === 1 ? "y" : "ies"} (${overdue.length} overdue/at risk)`
        : "No open external dependencies",
  };
}

function scoreBenefits(
  project: ProjectFinanceLike & { id?: string },
  benefitLines?: BenefitLineLike[],
): { score: number; detail: string } {
  const target = sumBenefitsTarget(benefitLines, project, project.id);
  const realised = sumBenefitsRealised(benefitLines, project, project.id);
  if (target <= 0) {
    return {
      score: realised > 0 ? 90 : 78,
      detail: realised > 0 ? "Benefits realised without formal target" : "No benefits target set",
    };
  }
  const rate = realised / target;
  const score = clamp(40 + rate * 60);
  return {
    score,
    detail: `${Math.round(rate * 100)}% benefits realised (${Math.round(realised).toLocaleString()} / ${Math.round(target).toLocaleString()})`,
  };
}

function buildDrivers(dimensions: DimensionScore[], previousScore: number | null, score: number): HealthDriver[] {
  const weak = dimensions
    .filter((d) => d.score < 80)
    .map((d) => ({
      dimension: d.key,
      label: d.label,
      severity: d.rag,
      message: d.detail,
      scoreImpact: Math.round((100 - d.score) * d.weight),
    }))
    .sort((a, b) => b.scoreImpact - a.scoreImpact);

  if (previousScore != null && score < previousScore - 1) {
    // Prefer weakest as "main drivers" of the drop
    return weak.slice(0, 4);
  }
  return weak.slice(0, 4);
}

function buildEarlyWarnings(opts: {
  projectName: string;
  workPct: number;
  schedulePct: number;
  ftePlan: number;
  fteActual: number;
  approved: number;
  forecastFinal: number;
  criticalRisks: number;
  gateLateDays: number;
  utilPct: number;
  fyWatches?: ReturnType<typeof fyYearWatches>;
  envelopeOver?: ReturnType<typeof fyEnvelopeOverAllocation>;
  parentEnvelopes?: ParentEnvelopeWatch[];
}): EarlyWarning[] {
  const out: EarlyWarning[] = [];
  const ftePct = opts.ftePlan > 0 ? opts.fteActual / opts.ftePlan : 0;
  const workGap = ftePct - opts.workPct;

  if (opts.ftePlan > 0 && ftePct >= 0.45 && workGap >= 0.12) {
    const delayWeeks = Math.max(1, Math.round(workGap * 16));
    const costImpact =
      opts.approved > 0 ? Math.round(opts.approved * workGap * 0.35) : Math.round(opts.fteActual * workGap);
    out.push({
      code: "fte_vs_work",
      title: "Early warning detected",
      message: `${opts.projectName} has consumed ${Math.round(ftePct * 100)}% of planned FTE but completed only ${Math.round(opts.workPct * 100)}% of planned work.`,
      potentialDelayWeeks: delayWeeks,
      potentialCostImpact: costImpact,
      recommendedAction: "Reforecast remaining work.",
      severity: workGap >= 0.2 ? "Red" : "Amber",
    });
  }

  if (opts.schedulePct - opts.workPct >= 0.15) {
    const delayWeeks = Math.max(1, Math.round((opts.schedulePct - opts.workPct) * 20));
    out.push({
      code: "schedule_slip",
      title: "Schedule early warning",
      message: `Elapsed schedule is ${Math.round(opts.schedulePct * 100)}% but earned work is only ${Math.round(opts.workPct * 100)}%.`,
      potentialDelayWeeks: delayWeeks,
      potentialCostImpact:
        opts.approved > 0 ? Math.round(opts.approved * (opts.schedulePct - opts.workPct) * 0.25) : null,
      recommendedAction: "Re-baseline the schedule or recover the critical path.",
      severity: opts.schedulePct - opts.workPct >= 0.25 ? "Red" : "Amber",
    });
  }

  if (opts.forecastFinal - opts.approved > opts.approved * 0.05 && opts.approved > 0) {
    out.push({
      code: "cost_overrun",
      title: "Cost early warning",
      message: `Burn / EAC implies a forecast final cost of $${Math.round(opts.forecastFinal).toLocaleString()} against $${Math.round(opts.approved).toLocaleString()} approved.`,
      potentialDelayWeeks: null,
      potentialCostImpact: Math.round(opts.forecastFinal - opts.approved),
      recommendedAction: "Request funding or reduce scope before the next gate.",
      severity: opts.forecastFinal - opts.approved > opts.approved * 0.1 ? "Red" : "Amber",
    });
  }

  if (opts.envelopeOver && opts.envelopeOver.overBy > 0 && opts.envelopeOver.overall > 0) {
    out.push({
      code: "fy_over_envelope",
      title: "FY allocation early warning",
      message: `${opts.projectName} FY allocations sum to $${Math.round(opts.envelopeOver.allocated).toLocaleString()} against $${Math.round(opts.envelopeOver.overall).toLocaleString()} overall budget.`,
      potentialDelayWeeks: null,
      potentialCostImpact: Math.round(opts.envelopeOver.overBy),
      recommendedAction: "Rebalance year slices so FY allocation stays a subset of the overall envelope.",
      severity: opts.envelopeOver.overBy > opts.envelopeOver.overall * 0.1 ? "Red" : "Amber",
    });
  }

  for (const watch of opts.parentEnvelopes ?? []) {
    const st = parentEnvelopeStatus(watch.envelope, watch.childApproved);
    if (!st.constrained || st.overBy <= 0) continue;
    const layerLabel = watch.layer === "alignment" ? "Strategic Alignment" : "Program";
    out.push({
      code: watch.layer === "alignment" ? "sa_over_envelope" : "program_over_envelope",
      title: `${layerLabel} envelope early warning`,
      message: `${layerLabel} “${watch.name}” child project approved funding sums to $${Math.round(st.allocated).toLocaleString()} against $${Math.round(st.envelope).toLocaleString()} envelope.`,
      potentialDelayWeeks: null,
      potentialCostImpact: Math.round(st.overBy),
      recommendedAction:
        "Rebalance project envelopes or raise the parent pot. This project's own financial score is unchanged.",
      severity: st.rag === "Red" ? "Red" : "Amber",
    });
  }

  const fyWorst = worstFyOverAllocation(opts.fyWatches ?? []);
  if (
    fyWorst &&
    fyWorst.allocation > 0 &&
    (fyWorst.overBy > 0 || fyWorst.capexOverBy > 0 || fyWorst.opexOverBy > 0)
  ) {
    const capexPeak = Math.max(fyWorst.planCapex, fyWorst.actualCapex, fyWorst.forecastCapex);
    const opexPeak = Math.max(fyWorst.planOpex, fyWorst.actualOpex, fyWorst.forecastOpex);
    const parts = [
      fyWorst.overBy > 0
        ? `${fyWorst.peakSource} $${Math.round(fyWorst.peak).toLocaleString()} vs $${Math.round(fyWorst.allocation).toLocaleString()} allocated`
        : null,
      fyWorst.capexOverBy > 0
        ? `CapEx $${Math.round(capexPeak).toLocaleString()} vs $${Math.round(fyWorst.allocCapex).toLocaleString()} allocated`
        : null,
      fyWorst.opexOverBy > 0
        ? `OpEx $${Math.round(opexPeak).toLocaleString()} vs $${Math.round(fyWorst.allocOpex).toLocaleString()} allocated`
        : null,
    ].filter(Boolean);
    const impact = Math.max(fyWorst.overBy, fyWorst.capexOverBy, fyWorst.opexOverBy);
    out.push({
      code: "fy_over_allocation",
      title: "FY allocation early warning",
      message: `${opts.projectName} in ${fyWorst.fy}: ${parts.join(" · ")}.`,
      potentialDelayWeeks: null,
      potentialCostImpact: Math.round(impact),
      recommendedAction: "Rephase the estimate or raise the FY CapEx/OpEx allocation before the next gate.",
      severity: impact > fyWorst.allocation * 0.1 ? "Red" : "Amber",
    });
  }

  if (opts.criticalRisks >= 2) {
    out.push({
      code: "critical_risks",
      title: "Risk early warning",
      message: `${opts.criticalRisks} critical risks are open and may threaten delivery.`,
      potentialDelayWeeks: opts.criticalRisks,
      potentialCostImpact: null,
      recommendedAction: "Escalate risks and assign mitigation owners this week.",
      severity: "Red",
    });
  }

  if (opts.utilPct >= 110) {
    out.push({
      code: "resource_overload",
      title: "Resource early warning",
      message: `Resource utilisation reached ~${Math.round(opts.utilPct)}%.`,
      potentialDelayWeeks: 2,
      potentialCostImpact: null,
      recommendedAction: "Rebalance allocations or defer lower-priority work.",
      severity: "Amber",
    });
  }

  if (opts.gateLateDays >= 15) {
    out.push({
      code: "gate_overdue",
      title: "Governance early warning",
      message: `A stage gate is overdue by ${opts.gateLateDays} days.`,
      potentialDelayWeeks: Math.ceil(opts.gateLateDays / 7),
      potentialCostImpact: null,
      recommendedAction: "Clear the gate decision path or formally replan the phase.",
      severity: "Red",
    });
  }

  return out;
}

function buildPredictive(
  score: number,
  dimensions: DimensionScore[],
  earlyWarnings: EarlyWarning[],
): PredictiveHealth {
  // Project 30-day trajectory from current weak dimensions + active warnings.
  const pressure = dimensions.reduce((s, d) => s + Math.max(0, 80 - d.score) * d.weight, 0);
  const warnPenalty = earlyWarnings.reduce(
    (s, w) => s + (w.severity === "Red" ? 6 : w.severity === "Amber" ? 3 : 0),
    0,
  );
  const forecastScore30d = clamp(score - pressure * 0.55 - warnPenalty);
  const evidence = dimensions.filter((d) => d.score < 100).length + earlyWarnings.length;
  const confidencePct = clamp(55 + evidence * 4, 50, 92);
  const likelyRag = scoreToRag(forecastScore30d);
  let warning: string | null = null;
  if (scoreToRag(score) !== "Red" && likelyRag === "Red") {
    warning = "Project is likely to become Red within 30 days if current trends continue.";
  } else if (scoreToRag(score) === "Green" && likelyRag === "Amber") {
    warning = "Project is likely to become Amber within 30 days if current trends continue.";
  }
  return {
    currentScore: Math.round(score),
    forecastScore30d: Math.round(forecastScore30d),
    confidencePct: Math.round(confidencePct),
    likelyRag,
    warning,
  };
}

function buildAutomatedForecast(opts: {
  project: HealthEngineInput["project"];
  workItems: EvmWorkItemLike[];
  monthly: EvmMonthlyLike[];
  nowMs: number;
}): AutomatedForecast {
  const approved = projectApprovedFunding(opts.project);
  const actual = projectIncurred(opts.project);
  const statedFac = projectForecast(opts.project);
  const remainingApproved = Math.max(0, approved - actual);

  const start = projectScheduleStart(opts.project);
  const startMs = start ? new Date(start).getTime() : NaN;
  const elapsedWeeks =
    Number.isFinite(startMs) && opts.nowMs > startMs
      ? Math.max(1 / 7, (opts.nowMs - startMs) / (7 * 86_400_000))
      : null;
  const burnRatePerWeek = elapsedWeeks && actual > 0 ? actual / elapsedWeeks : null;

  const evm = computeProjectEvm({
    project: opts.project as any,
    workItems: opts.workItems,
    monthly: opts.monthly,
    asOf: new Date(opts.nowMs).toISOString().slice(0, 10),
  });

  let forecastFinalCost = approved || statedFac || actual;
  let source: AutomatedForecast["source"] = "approved";

  if (evm.eac != null && evm.eac > 0 && (evm.cpi != null || opts.workItems.length > 0)) {
    forecastFinalCost = evm.eac;
    source = "evm_eac";
  } else if (burnRatePerWeek && burnRatePerWeek > 0) {
    const end = projectScheduleEnd(opts.project);
    const endMs = end ? new Date(end).getTime() : NaN;
    const totalWeeks =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? (endMs - startMs) / (7 * 86_400_000)
        : elapsedWeeks
          ? elapsedWeeks / Math.max(0.15, workItemPctComplete(opts.workItems) || 0.15)
          : null;
    if (totalWeeks && totalWeeks > 0) {
      forecastFinalCost = burnRatePerWeek * totalWeeks;
      source = "burn_rate";
    }
  } else if (statedFac > 0) {
    forecastFinalCost = Math.max(statedFac, actual);
    source = "stated_fac";
  }

  forecastFinalCost = Math.max(forecastFinalCost, actual);
  const overrun = approved > 0 ? forecastFinalCost - approved : 0;

  return {
    approvedBudget: approved,
    actual,
    remainingApproved,
    burnRatePerWeek,
    forecastFinalCost,
    overrun,
    source,
    message:
      overrun > 0
        ? `Forecast overrun: $${Math.round(overrun).toLocaleString()}`
        : `Forecast final cost within approved funding`,
  };
}

/** Full health engine evaluation for one project. */
export function evaluateProjectHealth(input: HealthEngineInput): HealthEngineResult {
  const nowMs = input.nowMs ?? Date.now();
  const project = input.project;
  const workItems = input.workItems ?? [];
  const gates = input.gates ?? [];
  const risks = input.risks ?? [];
  const dependencies = input.dependencies ?? [];
  const changeRequests = input.changeRequests ?? [];
  const allocations = input.allocations ?? [];
  const monthly = input.monthly ?? [];

  const evm = computeProjectEvm({
    project: project as any,
    workItems,
    monthly,
    asOf: new Date(nowMs).toISOString().slice(0, 10),
  });
  // Without work-item signal, treat schedule % as earned work so portfolio
  // views don't false-red every project.
  const hasWorkSignal = workItems.length > 0;
  const workPct = hasWorkSignal ? evm.pctComplete : evm.schedulePct;
  const schedulePct = evm.schedulePct;

  const ftePlan = monthly.reduce(
    (s, m) => s + num((m as { opex_labor_planned?: number | null }).opex_labor_planned),
    0,
  );
  const fteActual = monthly.reduce(
    (s, m) => s + num((m as { opex_labor_actual?: number | null }).opex_labor_actual),
    0,
  );
  const approved = projectApprovedFunding(project);
  const statedFac = projectForecast(project);
  const forecastBundle = buildAutomatedForecast({ project, workItems, monthly, nowMs });
  const facForFinancial = Math.max(statedFac, forecastBundle.forecastFinalCost);

  const schedule = scoreSchedule(workPct, schedulePct);
  const fyWatches = fyYearWatches({
    allocations: (input.fyAllocations ?? []) as FyAllocationLike[],
    monthly: monthly as any,
    fyStartMonth: input.fyStartMonth,
    overallBudget: approved,
    project,
  });
  const fyAllocRows = (input.fyAllocations ?? []) as FyAllocationLike[];
  const envelopeOver = fyEnvelopeOverAllocation({
    allocations: fyAllocRows,
    overallBudget: approved,
  });
  const financial = scoreFinancialFyAllocation(
    scoreFinancial(approved, facForFinancial, projectIncurred(project)),
    fyWatches,
    approved,
    fyAllocRows,
  );
  const scope = scoreScope(workItems, changeRequests);
  const delivery = scoreDelivery(workPct, overdueGateDays(gates, nowMs), workItems);
  const resource = scoreResource(allocations, ftePlan, fteActual);
  const risk = scoreRisk(risks);
  const deps = scoreDependencies(dependencies, nowMs);
  const benefits = scoreBenefits(project, input.benefitLines);

  const raw: Record<HealthDimensionKey, { score: number; detail: string }> = {
    schedule,
    financial,
    scope,
    delivery,
    resource,
    risk,
    dependencies: deps,
    benefits,
  };

  const dimensions: DimensionScore[] = (Object.keys(HEALTH_DIMENSION_WEIGHTS) as HealthDimensionKey[]).map(
    (key) => {
      const score = clamp(raw[key].score);
      return {
        key,
        label: HEALTH_DIMENSION_LABELS[key],
        weight: HEALTH_DIMENSION_WEIGHTS[key],
        score: Math.round(score),
        rag: scoreToRag(score),
        detail: raw[key].detail,
      };
    },
  );

  const score = clamp(
    dimensions.reduce((s, d) => s + d.score * d.weight, 0),
  );
  const rounded = Math.round(score);
  const rag = scoreToRag(rounded);
  const previousScore =
    input.previousScore != null && Number.isFinite(input.previousScore)
      ? Math.round(input.previousScore)
      : null;

  const utilPct =
    allocations.length > 0
      ? allocations.reduce(
          (s, a) =>
            s +
            Math.max(
              num(a.allocation_pct),
              num(a.allocation_percent),
              num(a.fte) * 100,
              num(a.allocated_hours) > 0 ? Math.min(150, (num(a.allocated_hours) / 40) * 100) : 0,
              0,
            ),
          0,
        ) / Math.max(1, allocations.length)
      : ftePlan > 0
        ? (fteActual / ftePlan) * 100
        : 0;

  const earlyWarnings = buildEarlyWarnings({
    projectName: String(project.name || project.project_code || "This project"),
    workPct,
    schedulePct,
    ftePlan,
    fteActual,
    approved,
    forecastFinal: forecastBundle.forecastFinalCost,
    criticalRisks: risks.filter((r) => isOpenRisk(r) && isCriticalRisk(r)).length,
    gateLateDays: overdueGateDays(gates, nowMs),
    utilPct,
    fyWatches,
    envelopeOver,
    parentEnvelopes: input.parentEnvelopes,
  });

  return {
    score: rounded,
    rag,
    previousScore,
    scoreDelta: previousScore != null ? rounded - previousScore : null,
    dimensions,
    drivers: buildDrivers(dimensions, previousScore, rounded),
    earlyWarnings,
    predictive: buildPredictive(rounded, dimensions, earlyWarnings),
    forecast: forecastBundle,
    workPct,
    schedulePct,
    ftePlanPct: ftePlan > 0 ? fteActual / ftePlan : 0,
    fteActualPct: ftePlan > 0 ? fteActual / ftePlan : 0,
  };
}

export function healthScoreStorageKey(projectId: string): string {
  return `iprojectx.healthScore.${projectId}`;
}

export function readStoredHealthScore(projectId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(healthScoreStorageKey(projectId));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeStoredHealthScore(projectId: string, score: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(healthScoreStorageKey(projectId), String(Math.round(score)));
  } catch {
    /* ignore quota */
  }
}
