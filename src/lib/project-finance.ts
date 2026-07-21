/**
 * Canonical project finance helpers — single source of truth for portfolio pages.
 *
 * Hierarchy (most specific → rollup):
 * 1. financials_monthly  — cashflow by period
 * 2. fy_allocations      — budget + forecast split by FY (capex/opex/benefits detail)
 * 3. benefits register   — benefit lines; project.benefits_* are rollups
 * 4. projects            — approved funding, incurred, FAC, benefit rollups
 */

export type ProjectFinanceLike = {
  budget?: number | null;
  capex_approved?: number | null;
  capex_incurred?: number | null;
  opex_approved?: number | null;
  opex_incurred?: number | null;
  benefits_target?: number | null;
  benefits_realised?: number | null;
  roi_percent?: number | null;
  /** Explicit FAC when set (schema column or import alias). */
  forecast_at_completion?: number | null;
  fac?: number | null;
  forecast?: number | null;
  /** Legacy alias — treated as approved funding when present. */
  approved_funding?: number | null;
};

export type BenefitLineLike = {
  project_id?: string | null;
  target_value?: number | null;
  realised_value?: number | null;
};

export type FyAllocationLike = {
  fy?: string | null;
  /** Total budget $ allocated to this FY (preferred). */
  budget?: number | null;
  /** Total forecast $ allocated to this FY (preferred). */
  forecast?: number | null;
  capex?: number | null;
  opex?: number | null;
  benefits?: number | null;
  /** Legacy aliases from older exports */
  allocated_amount?: number | null;
  forecast_amount?: number | null;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Approved funding = budget if set, else CapEx+OpEx approved. */
export function projectApprovedFunding(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  const explicit = num(p.approved_funding);
  if (explicit) return explicit;
  const budget = num(p.budget);
  if (budget) return budget;
  return num(p.capex_approved) + num(p.opex_approved);
}

export function projectCapexApproved(p: ProjectFinanceLike | null | undefined): number {
  return num(p?.capex_approved);
}

export function projectOpexApproved(p: ProjectFinanceLike | null | undefined): number {
  return num(p?.opex_approved);
}

export function projectIncurred(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  return num(p.capex_incurred) + num(p.opex_incurred);
}

/**
 * Forecast at completion.
 * Prefer explicit FAC; else CapEx+OpEx approved; else budget.
 * Does NOT invent a 5% uplift — that distorted board views.
 */
export function projectForecast(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  const fac = num(p.forecast_at_completion || p.fac || p.forecast);
  if (fac) return fac;
  const approved = num(p.capex_approved) + num(p.opex_approved);
  if (approved) return approved;
  return num(p.budget);
}

export function projectRemaining(p: ProjectFinanceLike | null | undefined): number {
  return Math.max(0, projectApprovedFunding(p) - projectIncurred(p));
}

export function projectBenefitsTarget(p: ProjectFinanceLike | null | undefined): number {
  return num(p?.benefits_target);
}

export function projectBenefitsRealised(p: ProjectFinanceLike | null | undefined): number {
  return num(p?.benefits_realised);
}

/** Benefits from register lines (canonical). Falls back to project rollups when empty. */
export function sumBenefitsTarget(
  lines: BenefitLineLike[] | null | undefined,
  project?: ProjectFinanceLike | null,
  projectId?: string | null,
): number {
  const scoped = (lines ?? []).filter((b) =>
    projectId ? b.project_id === projectId : true,
  );
  const fromLines = scoped.reduce((s, b) => s + num(b.target_value), 0);
  if (fromLines > 0) return fromLines;
  return projectBenefitsTarget(project);
}

export function sumBenefitsRealised(
  lines: BenefitLineLike[] | null | undefined,
  project?: ProjectFinanceLike | null,
  projectId?: string | null,
): number {
  const scoped = (lines ?? []).filter((b) =>
    projectId ? b.project_id === projectId : true,
  );
  const fromLines = scoped.reduce((s, b) => s + num(b.realised_value), 0);
  if (fromLines > 0) return fromLines;
  return projectBenefitsRealised(project);
}

/** Target ROI % = (benefits target − approved funding) / approved × 100 */
export function projectTargetRoi(p: ProjectFinanceLike | null | undefined): number {
  const cost = projectApprovedFunding(p);
  if (cost <= 0) return 0;
  return ((projectBenefitsTarget(p) - cost) / cost) * 100;
}

/** Realised ROI % = (benefits realised − incurred) / incurred × 100 */
export function projectRealisedRoi(p: ProjectFinanceLike | null | undefined): number {
  const cost = projectIncurred(p);
  if (cost <= 0) return 0;
  return ((projectBenefitsRealised(p) - cost) / cost) * 100;
}

/**
 * Display ROI: prefer stored roi_percent when set; else target ROI.
 * Use projectRealisedRoi when the page is about outcomes.
 */
export function projectRoiPercent(p: ProjectFinanceLike | null | undefined): number {
  const stored = num(p?.roi_percent);
  if (stored) return stored;
  return projectTargetRoi(p);
}

/** Benefit / cost ratio (NOT EVM CPI). */
export function projectBenefitCostRatio(p: ProjectFinanceLike | null | undefined): number {
  const incurred = projectIncurred(p);
  if (incurred <= 0) return 0;
  return projectBenefitsRealised(p) / incurred;
}

/** FY allocation budget $ (schema: budget preferred, else capex+opex). */
export function fyAllocBudget(a: FyAllocationLike | null | undefined): number {
  if (!a) return 0;
  const b = num(a.budget);
  if (b) return b;
  const legacy = num(a.allocated_amount);
  if (legacy) return legacy;
  return num(a.capex) + num(a.opex);
}

/** FY allocation forecast $ (schema: forecast preferred, else budget fallback). */
export function fyAllocForecast(a: FyAllocationLike | null | undefined): number {
  if (!a) return 0;
  const f = num(a.forecast ?? a.forecast_amount);
  if (f) return f;
  return fyAllocBudget(a);
}

/** Split a total amount into CapEx/OpEx using project approved mix. */
export function splitCapexOpex(
  total: number,
  p: ProjectFinanceLike | null | undefined,
): { capex: number; opex: number } {
  const cap = num(p?.capex_approved);
  const opex = num(p?.opex_approved);
  const mix = cap + opex;
  if (mix <= 0) return { capex: total, opex: 0 };
  const capexShare = (cap / mix) * total;
  return { capex: Math.round(capexShare * 100) / 100, opex: Math.round((total - capexShare) * 100) / 100 };
}
