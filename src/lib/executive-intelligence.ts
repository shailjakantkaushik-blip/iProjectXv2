/**
 * Executive intelligence engines:
 * - What-If delay cascade
 * - Resource capacity gaps + optimisation
 * - Dependency criticality
 * - Change-request impact
 * - Multi-factor prioritisation + funding what-if
 * - Benefits realisation narrative
 * - Governance cadence automation (client-generated)
 */

import {
  projectApprovedFunding,
  projectBenefitsRealised,
  projectBenefitsTarget,
  projectForecast,
  projectIncurred,
  projectRoiPercent,
} from "@/lib/project-finance";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// What-If delay cascade
// ---------------------------------------------------------------------------

export type WhatIfProject = {
  id: string;
  name?: string | null;
  project_code?: string | null;
  program?: string | null;
  budget?: number | null;
  capex_approved?: number | null;
  opex_approved?: number | null;
  capex_incurred?: number | null;
  opex_incurred?: number | null;
  forecast_at_completion?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  priority?: string | null;
  status?: string | null;
};

export type WhatIfDependency = {
  project_id: string;
  depends_on_project_id: string;
  status?: string | null;
};

export type CascadeNode = {
  projectId: string;
  label: string;
  program: string;
  delayWeeks: number;
  depth: number;
  costImpact: number;
};

export type WhatIfResult = {
  seedProjectId: string;
  seedDelayWeeks: number;
  cascade: CascadeNode[];
  programsAffected: { program: string; delayWeeks: number }[];
  portfolioMilestoneDelayWeeks: number;
  additionalCost: number;
  summaryLines: string[];
};

function projectLabel(p: WhatIfProject): string {
  return p.project_code ? `${p.project_code} · ${p.name || "Project"}` : String(p.name || p.id);
}

function weeklyBurn(p: WhatIfProject): number {
  const approved = projectApprovedFunding(p);
  const incurred = projectIncurred(p);
  const start = p.actual_start_date || p.planned_start_date || p.start_date;
  const end = p.planned_end_date || p.end_date;
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    const weeks = Math.max(1, (endMs - startMs) / (7 * 86_400_000));
    return Math.max(approved, projectForecast(p)) / weeks;
  }
  // Fallback: 2% of remaining funding per week
  return Math.max(0, approved - incurred) * 0.02;
}

/** BFS delay propagation through depends_on → dependents. */
export function simulateDelayWhatIf(opts: {
  seedProjectId: string;
  delayWeeks: number;
  projects: WhatIfProject[];
  dependencies: WhatIfDependency[];
}): WhatIfResult {
  const byId = new Map(opts.projects.map((p) => [p.id, p]));
  // Edge: predecessor → successor (who is blocked if predecessor slips)
  const successors = new Map<string, string[]>();
  for (const d of opts.dependencies) {
    if (!d.depends_on_project_id || !d.project_id) continue;
    const list = successors.get(d.depends_on_project_id) || [];
    list.push(d.project_id);
    successors.set(d.depends_on_project_id, list);
  }

  const delay = new Map<string, number>();
  const depth = new Map<string, number>();
  delay.set(opts.seedProjectId, opts.delayWeeks);
  depth.set(opts.seedProjectId, 0);

  const queue = [opts.seedProjectId];
  while (queue.length) {
    const id = queue.shift()!;
    const dWeeks = delay.get(id) || 0;
    const dDepth = depth.get(id) || 0;
    for (const succ of successors.get(id) || []) {
      // Downstream absorbs ~70% of upstream slip (partial float assumption)
      const propagated = Math.max(1, Math.round(dWeeks * 0.7));
      const prev = delay.get(succ) || 0;
      if (propagated > prev) {
        delay.set(succ, propagated);
        depth.set(succ, dDepth + 1);
        queue.push(succ);
      }
    }
  }

  const cascade: CascadeNode[] = [...delay.entries()]
    .map(([projectId, delayWeeks]) => {
      const p = byId.get(projectId);
      const costImpact = Math.round(weeklyBurn(p || { id: projectId }) * delayWeeks);
      return {
        projectId,
        label: p ? projectLabel(p) : projectId,
        program: String(p?.program || "Unassigned"),
        delayWeeks,
        depth: depth.get(projectId) || 0,
        costImpact,
      };
    })
    .sort((a, b) => a.depth - b.depth || b.delayWeeks - a.delayWeeks);

  const programMap = new Map<string, number>();
  for (const n of cascade) {
    programMap.set(n.program, Math.max(programMap.get(n.program) || 0, n.delayWeeks));
  }
  const programsAffected = [...programMap.entries()]
    .map(([program, delayWeeks]) => ({ program, delayWeeks }))
    .sort((a, b) => b.delayWeeks - a.delayWeeks);

  const portfolioMilestoneDelayWeeks = Math.max(
    0,
    ...cascade.filter((c) => c.depth > 0).map((c) => Math.round(c.delayWeeks * 0.5)),
    Math.round(opts.delayWeeks * 0.35),
  );
  const additionalCost = cascade.reduce((s, c) => s + c.costImpact, 0);

  const summaryLines = cascade.slice(0, 8).map((c) => `${c.label}: +${c.delayWeeks} weeks`);
  if (programsAffected[0]) {
    summaryLines.push(`Program ${programsAffected[0].program}: +${programsAffected[0].delayWeeks} weeks`);
  }
  summaryLines.push(`Portfolio milestone: +${portfolioMilestoneDelayWeeks} weeks`);

  return {
    seedProjectId: opts.seedProjectId,
    seedDelayWeeks: opts.delayWeeks,
    cascade,
    programsAffected,
    portfolioMilestoneDelayWeeks,
    additionalCost,
    summaryLines,
  };
}

// ---------------------------------------------------------------------------
// Resource capacity + optimisation
// ---------------------------------------------------------------------------

export type CapacityResource = {
  id: string;
  name?: string | null;
  role?: string | null;
  skills?: string | null;
  capacity_hours_week?: number | null;
  status?: string | null;
};

export type CapacityAllocation = {
  resource_id: string;
  project_id: string;
  allocation_percent?: number | null;
  allocated_hours?: number | null;
  period_month?: string | null;
};

export type CapacityGapRow = {
  skill: string;
  availableFte: number;
  requiredFte: number;
  gapFte: number;
};

export type CapacityMonthResult = {
  month: string;
  availableFte: number;
  requiredFte: number;
  gapFte: number;
  bySkill: CapacityGapRow[];
  narrative: string;
};

function parseSkills(raw: string | null | undefined, role?: string | null): string[] {
  const parts = String(raw || "")
    .split(/[,;/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length) return parts;
  const r = String(role || "").trim();
  return r ? [r] : ["General"];
}

function allocationFte(a: CapacityAllocation): number {
  if (num(a.allocation_percent) > 0) return num(a.allocation_percent) / 100;
  if (num(a.allocated_hours) > 0) return num(a.allocated_hours) / 40;
  return 0;
}

export function computeCapacityGap(opts: {
  month: string; // YYYY-MM
  resources: CapacityResource[];
  allocations: CapacityAllocation[];
}): CapacityMonthResult {
  const month = opts.month.slice(0, 7);
  const activeRes = opts.resources.filter((r) => !r.status || /active/i.test(String(r.status)));
  const monthAlloc = opts.allocations.filter((a) => String(a.period_month || "").slice(0, 7) === month);

  const availBySkill = new Map<string, number>();
  for (const r of activeRes) {
    const capFte = (num(r.capacity_hours_week) || 40) / 40;
    const skills = parseSkills(r.skills, r.role);
    const share = capFte / skills.length;
    for (const s of skills) availBySkill.set(s, (availBySkill.get(s) || 0) + share);
  }

  const reqBySkill = new Map<string, number>();
  const resById = new Map(activeRes.map((r) => [r.id, r]));
  for (const a of monthAlloc) {
    const r = resById.get(a.resource_id);
    const fte = allocationFte(a);
    if (fte <= 0) continue;
    const skills = parseSkills(r?.skills, r?.role);
    const share = fte / skills.length;
    for (const s of skills) reqBySkill.set(s, (reqBySkill.get(s) || 0) + share);
  }

  const skillKeys = new Set([...availBySkill.keys(), ...reqBySkill.keys()]);
  const bySkill: CapacityGapRow[] = [...skillKeys]
    .map((skill) => {
      const availableFte = availBySkill.get(skill) || 0;
      const requiredFte = reqBySkill.get(skill) || 0;
      return {
        skill,
        availableFte: Math.round(availableFte * 10) / 10,
        requiredFte: Math.round(requiredFte * 10) / 10,
        gapFte: Math.round((requiredFte - availableFte) * 10) / 10,
      };
    })
    .sort((a, b) => b.gapFte - a.gapFte);

  const availableFte = Math.round(activeRes.reduce((s, r) => s + (num(r.capacity_hours_week) || 40) / 40, 0) * 10) / 10;
  const requiredFte = Math.round(monthAlloc.reduce((s, a) => s + allocationFte(a), 0) * 10) / 10;
  const gapFte = Math.round((requiredFte - availableFte) * 10) / 10;

  const bottlenecks = bySkill.filter((b) => b.gapFte > 0.5).slice(0, 5);
  const narrative =
    gapFte > 0.5
      ? `Capacity is insufficient to deliver the current portfolio (${gapFte} FTE short).`
      : gapFte < -0.5
        ? `Portfolio demand is within capacity (${Math.abs(gapFte)} FTE headroom).`
        : `Demand and capacity are roughly balanced.`;

  return {
    month,
    availableFte,
    requiredFte,
    gapFte,
    bySkill: bottlenecks.length ? bottlenecks : bySkill.slice(0, 6),
    narrative,
  };
}

export type ReallocationSuggestion = {
  skill: string;
  fromProjectId: string;
  fromLabel: string;
  toProjectId: string;
  toLabel: string;
  fte: number;
  rationale: string;
  expectedOutcome: string;
};

export function suggestReallocations(opts: {
  month: string;
  resources: CapacityResource[];
  allocations: CapacityAllocation[];
  projects: WhatIfProject[];
}): ReallocationSuggestion[] {
  const month = opts.month.slice(0, 7);
  const projById = new Map(opts.projects.map((p) => [p.id, p]));
  const resById = new Map(opts.resources.map((r) => [r.id, r]));
  const monthAlloc = opts.allocations.filter((a) => String(a.period_month || "").slice(0, 7) === month);

  // Demand by project+skill
  const demand = new Map<string, number>(); // key projectId::skill
  const supplyBySkill = new Map<string, number>();
  for (const a of monthAlloc) {
    const r = resById.get(a.resource_id);
    const fte = allocationFte(a);
    for (const skill of parseSkills(r?.skills, r?.role)) {
      const key = `${a.project_id}::${skill}`;
      demand.set(key, (demand.get(key) || 0) + fte / parseSkills(r?.skills, r?.role).length);
      supplyBySkill.set(skill, (supplyBySkill.get(skill) || 0) + fte / parseSkills(r?.skills, r?.role).length);
    }
  }

  const gap = computeCapacityGap(opts);
  const suggestions: ReallocationSuggestion[] = [];

  for (const row of gap.bySkill.filter((g) => g.gapFte > 0.5).slice(0, 3)) {
    // Find lowest-priority project with this skill demand, and highest-priority needing more
    const skillDemand = [...demand.entries()]
      .filter(([k]) => k.endsWith(`::${row.skill}`))
      .map(([k, fte]) => {
        const projectId = k.split("::")[0];
        const p = projById.get(projectId);
        const pri = String(p?.priority || "");
        const priRank = /P1|Critical/i.test(pri) ? 4 : /P2|High/i.test(pri) ? 3 : /P3|Medium/i.test(pri) ? 2 : 1;
        return { projectId, fte, priRank, label: p ? projectLabel(p) : projectId };
      })
      .sort((a, b) => a.priRank - b.priRank);

    const donor = skillDemand.find((d) => d.fte >= 0.5 && d.priRank <= 2);
    const receiver = [...skillDemand].sort((a, b) => b.priRank - a.priRank)[0];
    if (!donor || !receiver || donor.projectId === receiver.projectId) continue;

    const move = Math.min(2, Math.round(Math.min(donor.fte * 0.5, row.gapFte) * 10) / 10);
    if (move < 0.5) continue;

    suggestions.push({
      skill: row.skill,
      fromProjectId: donor.projectId,
      fromLabel: donor.label,
      toProjectId: receiver.projectId,
      toLabel: receiver.label,
      fte: move,
      rationale: `${row.skill} shortage of ${row.gapFte} FTE — move from lower-priority work`,
      expectedOutcome: `${receiver.label} delay risk reduced (illustrative: 4 weeks → 1 week)`,
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Dependency intelligence
// ---------------------------------------------------------------------------

export type DepIntelRow = {
  projectId: string;
  label: string;
  downstreamCount: number;
  criticality: "High" | "Medium" | "Low";
  portfolioImpact: number;
  message: string;
};

export function analyzeDependencyCriticality(opts: {
  projects: WhatIfProject[];
  dependencies: WhatIfDependency[];
}): DepIntelRow[] {
  const byId = new Map(opts.projects.map((p) => [p.id, p]));
  const downstream = new Map<string, Set<string>>();

  for (const d of opts.dependencies) {
    if (!d.depends_on_project_id || !d.project_id) continue;
    const set = downstream.get(d.depends_on_project_id) || new Set();
    set.add(d.project_id);
    downstream.set(d.depends_on_project_id, set);
  }

  // Expand one hop further for systemic reach
  for (const [pred, set] of [...downstream.entries()]) {
    const extra = new Set<string>();
    for (const mid of set) {
      for (const far of downstream.get(mid) || []) extra.add(far);
    }
    for (const e of extra) set.add(e);
    downstream.set(pred, set);
  }

  return [...downstream.entries()]
    .map(([projectId, set]) => {
      const p = byId.get(projectId);
      const downstreamCount = set.size;
      const portfolioImpact = [...set].reduce((s, id) => {
        const q = byId.get(id);
        return s + projectApprovedFunding(q || { id });
      }, projectApprovedFunding(p || { id: projectId }) * 0.25);

      const criticality: DepIntelRow["criticality"] =
        downstreamCount >= 5 ? "High" : downstreamCount >= 2 ? "Medium" : "Low";

      return {
        projectId,
        label: p ? projectLabel(p) : projectId,
        downstreamCount,
        criticality,
        portfolioImpact: Math.round(portfolioImpact),
        message:
          downstreamCount > 0
            ? `If this project slips, ${downstreamCount} downstream project${downstreamCount === 1 ? "" : "s"} potentially affected.`
            : "No downstream dependents.",
      };
    })
    .sort((a, b) => b.downstreamCount - a.downstreamCount || b.portfolioImpact - a.portfolioImpact);
}

// ---------------------------------------------------------------------------
// Change control intelligence
// ---------------------------------------------------------------------------

export type ChangeIntelInput = {
  impact_cost?: number | null;
  impact_schedule_days?: number | null;
  impact_scope?: string | null;
  title?: string | null;
  project_id: string;
};

export type ChangeIntelResult = {
  budgetImpact: number;
  scheduleImpactDays: number;
  resourceImpactFte: number;
  dependencyImpactCount: number;
  benefitImpact: number;
  portfolioImpact: number;
  warning: string | null;
  dimensions: { label: string; value: string }[];
};

export function analyzeChangeRequestImpact(opts: {
  change: ChangeIntelInput;
  projects: WhatIfProject[];
  dependencies: WhatIfDependency[];
}): ChangeIntelResult {
  const budgetImpact = num(opts.change.impact_cost);
  const scheduleImpactDays = num(opts.change.impact_schedule_days);
  const weeks = scheduleImpactDays / 7;
  const p = opts.projects.find((x) => x.id === opts.change.project_id);
  const resourceImpactFte = Math.round(weeks * 0.5 * 10) / 10; // heuristic
  const downstream = opts.dependencies.filter((d) => d.depends_on_project_id === opts.change.project_id);
  const dependencyImpactCount = new Set(downstream.map((d) => d.project_id)).size;
  const benefitImpact = -Math.round(projectBenefitsTarget(p || null) * Math.min(0.25, weeks / 26));
  const portfolioImpact =
    budgetImpact +
    downstream.reduce((s, d) => {
      const q = opts.projects.find((x) => x.id === d.project_id);
      return s + projectApprovedFunding(q || null) * Math.min(0.1, weeks / 20);
    }, 0);

  const warning =
    dependencyImpactCount > 0
      ? `Change request may impact ${dependencyImpactCount} downstream project${dependencyImpactCount === 1 ? "" : "s"}.`
      : null;

  return {
    budgetImpact,
    scheduleImpactDays,
    resourceImpactFte,
    dependencyImpactCount,
    benefitImpact,
    portfolioImpact: Math.round(portfolioImpact),
    warning,
    dimensions: [
      { label: "Budget impact", value: `$${Math.round(budgetImpact).toLocaleString()}` },
      { label: "Schedule impact", value: `${scheduleImpactDays} days` },
      { label: "Resource impact", value: `~${resourceImpactFte} FTE-months` },
      { label: "Dependency impact", value: `${dependencyImpactCount} projects` },
      { label: "Benefit impact", value: `$${Math.round(benefitImpact).toLocaleString()}` },
      { label: "Portfolio impact", value: `$${Math.round(portfolioImpact).toLocaleString()}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// Prioritisation + investment + funding what-if
// ---------------------------------------------------------------------------

export type PriorityFactors = {
  strategic: number;
  roi: number;
  risk: number; // higher = safer
  urgency: number;
  regulatory: number;
  customer: number;
  resourceDemand: number; // higher = less demand pressure (inverted)
  dependencyCriticality: number;
};

export type RankedInvestment = {
  projectId: string;
  label: string;
  investment: number;
  strategicAlignment: number;
  expectedBenefit: number;
  risk: "Low" | "Medium" | "High";
  confidence: number;
  roi: number;
  score: number;
  factors: PriorityFactors;
};

const PRI_WEIGHT: Record<string, number> = {
  "P1 - Critical": 100,
  P1: 100,
  Critical: 100,
  "P2 - High": 75,
  P2: 75,
  High: 75,
  "P3 - Medium": 50,
  P3: 50,
  Medium: 50,
  "P4 - Low": 25,
  P4: 25,
  Low: 25,
};

export function rankPortfolioInvestments(opts: {
  projects: (WhatIfProject & {
    rag?: string | null;
    benefits_target?: number | null;
    benefits_realised?: number | null;
    roi_percent?: number | null;
    portfolio?: string | null;
  })[];
  dependencies?: WhatIfDependency[];
  strategicByProject?: Record<string, number>;
}): RankedInvestment[] {
  const depIntel = analyzeDependencyCriticality({
    projects: opts.projects,
    dependencies: opts.dependencies || [],
  });
  const depById = new Map(depIntel.map((d) => [d.projectId, d]));

  return opts.projects
    .map((p) => {
      const investment = projectApprovedFunding(p);
      const expectedBenefit = projectBenefitsTarget(p);
      const roi = projectRoiPercent(p);
      const strategicAlignment = clamp(
        opts.strategicByProject?.[p.id] ??
          (/strategic/i.test(String(p.portfolio || "")) ? 92 : PRI_WEIGHT[p.priority || ""] || 60),
      );
      const rag = String(p.rag || "").toLowerCase();
      const risk: RankedInvestment["risk"] =
        rag === "red" ? "High" : rag === "amber" ? "Medium" : "Low";
      const riskScore = risk === "Low" ? 85 : risk === "Medium" ? 60 : 35;
      const urgency = PRI_WEIGHT[p.priority || ""] || 40;
      const regulatory = /regulat|compliance|mandatory/i.test(String(p.portfolio || p.name || ""))
        ? 95
        : 40;
      const customer = /customer|client|experience/i.test(String(p.name || p.portfolio || ""))
        ? 80
        : 55;
      const dep = depById.get(p.id);
      const dependencyCriticality =
        dep?.criticality === "High" ? 90 : dep?.criticality === "Medium" ? 65 : 40;
      const resourceDemand = clamp(100 - Math.min(80, investment / 50_000));

      const factors: PriorityFactors = {
        strategic: strategicAlignment,
        roi: clamp(roi),
        risk: riskScore,
        urgency,
        regulatory,
        customer,
        resourceDemand,
        dependencyCriticality,
      };

      const score = Math.round(
        factors.strategic * 0.22 +
          factors.roi * 0.18 +
          factors.risk * 0.12 +
          factors.urgency * 0.14 +
          factors.regulatory * 0.1 +
          factors.customer * 0.08 +
          factors.resourceDemand * 0.06 +
          factors.dependencyCriticality * 0.1,
      );

      const confidence = clamp(
        55 +
          (expectedBenefit > 0 ? 10 : 0) +
          (investment > 0 ? 10 : 0) +
          (dep ? 5 : 0) +
          (rag ? 5 : 0),
      );

      return {
        projectId: p.id,
        label: projectLabel(p),
        investment,
        strategicAlignment,
        expectedBenefit,
        risk,
        confidence,
        roi: Math.round(roi),
        score,
        factors,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export type FundingOption = {
  id: string;
  label: string;
  projectIds: string[];
  projectLabels: string[];
  totalInvestment: number;
  expectedBenefit: number;
  avgScore: number;
};

export type FundingWhatIfResult = {
  budget: number;
  options: FundingOption[];
  recommended: FundingOption | null;
  rationale: string;
};

/** Greedy knapsack-style funding packs for executives. */
export function simulateFundingWhatIf(opts: {
  budget: number;
  ranked: RankedInvestment[];
}): FundingWhatIfResult {
  const budget = Math.max(0, opts.budget);
  const ranked = opts.ranked.filter((r) => r.investment > 0 || r.expectedBenefit > 0);

  function pack(seedOrder: RankedInvestment[], id: string, label: string): FundingOption {
    const chosen: RankedInvestment[] = [];
    let spend = 0;
    for (const r of seedOrder) {
      const cost = Math.max(r.investment, 1);
      if (spend + cost <= budget || chosen.length === 0) {
        if (spend + cost > budget && chosen.length) continue;
        if (spend + cost > budget && chosen.length === 0 && cost > budget) {
          // allow single oversized only if nothing else fits — skip
          continue;
        }
        if (spend + cost <= budget) {
          chosen.push(r);
          spend += cost;
        }
      }
    }
    const totalInvestment = chosen.reduce((s, r) => s + r.investment, 0);
    const expectedBenefit = chosen.reduce((s, r) => s + r.expectedBenefit, 0);
    const avgScore = chosen.length
      ? Math.round(chosen.reduce((s, r) => s + r.score, 0) / chosen.length)
      : 0;
    return {
      id,
      label,
      projectIds: chosen.map((c) => c.projectId),
      projectLabels: chosen.map((c) => c.label),
      totalInvestment,
      expectedBenefit,
      avgScore,
    };
  }

  const optionA = pack(ranked, "A", "Option A — top priority first");
  const byBenefit = [...ranked].sort((a, b) => b.expectedBenefit - a.expectedBenefit);
  const optionB = pack(byBenefit, "B", "Option B — max expected benefit");
  const byRoi = [...ranked].sort((a, b) => b.roi - a.roi);
  const optionC = pack(byRoi, "C", "Option C — highest ROI");

  const options = [optionA, optionB, optionC].filter((o) => o.projectIds.length > 0);
  // Dedupe identical packs
  const unique: FundingOption[] = [];
  for (const o of options) {
    const key = o.projectIds.slice().sort().join(",");
    if (unique.some((u) => u.projectIds.slice().sort().join(",") === key)) continue;
    unique.push(o);
  }

  const recommended =
    unique.slice().sort((a, b) => b.expectedBenefit - a.expectedBenefit || b.avgScore - a.avgScore)[0] ||
    null;

  return {
    budget,
    options: unique,
    recommended,
    rationale: recommended
      ? `Recommended portfolio: ${recommended.label} — greater expected value ($${Math.round(recommended.expectedBenefit).toLocaleString()}) within the $${Math.round(budget).toLocaleString()} funding constraint.`
      : "No fundable package fits the constraint with current project costs.",
  };
}

// ---------------------------------------------------------------------------
// Benefits realisation narrative
// ---------------------------------------------------------------------------

export function benefitsRealisationInsight(opts: {
  projectName: string;
  target: number;
  realised: number;
  deliveryStatus?: string | null;
}): { rate: number; rag: "Green" | "Amber" | "Red"; headline: string; detail: string } {
  const rate = opts.target > 0 ? (opts.realised / opts.target) * 100 : 0;
  const rag = rate >= 85 ? "Green" : rate >= 60 ? "Amber" : "Red";
  const delivered = /complete|closed|deploy/i.test(String(opts.deliveryStatus || ""));
  const headline = `Benefit realisation = ${Math.round(rate)}%`;
  const detail =
    delivered && rate < 85
      ? `${opts.projectName} delivered successfully, but expected business value has not been achieved.`
      : rate >= 85
        ? `${opts.projectName} is on track to realise expected benefits.`
        : `${opts.projectName} benefit realisation is behind target.`;
  return { rate, rag, headline, detail };
}

// ---------------------------------------------------------------------------
// Governance automation (client-generated cadence)
// ---------------------------------------------------------------------------

export type GovernanceCadenceTask = {
  key: string;
  projectId: string;
  projectLabel: string;
  cadence: "weekly" | "monthly" | "quarterly" | "stage_gate";
  title: string;
  dueDate: string;
  status: "open" | "overdue";
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generateGovernanceCadence(opts: {
  projects: WhatIfProject[];
  nowMs?: number;
}): GovernanceCadenceTask[] {
  const now = new Date(opts.nowMs ?? Date.now());
  const tasks: GovernanceCadenceTask[] = [];

  for (const p of opts.projects) {
    const st = String((p as any).status || "").toLowerCase();
    if (/complete|cancelled|closed|archived/.test(st)) continue;
    const label = projectLabel(p);

    // Weekly progress update — due end of this week (Sunday)
    const weeklyDue = new Date(now);
    weeklyDue.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
    tasks.push({
      key: `${p.id}:weekly`,
      projectId: p.id,
      projectLabel: label,
      cadence: "weekly",
      title: "Progress update",
      dueDate: isoDate(weeklyDue),
      status: "open",
    });

    // Monthly health + financial — due last day of month
    const monthDue = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    tasks.push({
      key: `${p.id}:monthly-health`,
      projectId: p.id,
      projectLabel: label,
      cadence: "monthly",
      title: "Project health review",
      dueDate: isoDate(monthDue),
      status: now > monthDue ? "overdue" : "open",
    });
    tasks.push({
      key: `${p.id}:monthly-fin`,
      projectId: p.id,
      projectLabel: label,
      cadence: "monthly",
      title: "Financial review",
      dueDate: isoDate(monthDue),
      status: now > monthDue ? "overdue" : "open",
    });

    // Quarterly benefits — due end of quarter
    const q = Math.floor(now.getMonth() / 3);
    const qDue = new Date(now.getFullYear(), q * 3 + 3, 0);
    tasks.push({
      key: `${p.id}:quarterly-benefits`,
      projectId: p.id,
      projectLabel: label,
      cadence: "quarterly",
      title: "Benefits review",
      dueDate: isoDate(qDue),
      status: now > qDue ? "overdue" : "open",
    });
  }

  // Mark weekly overdue if somehow past (shouldn't) — also mark month tasks overdue
  // when we're in last 3 days and not done (open stays; UI shows upcoming).
  return tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
