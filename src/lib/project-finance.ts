/**
 * Shared project financial helpers so portfolio pages use the same fallbacks
 * as the project register (instead of Streamlit-era phantom columns).
 */

export type ProjectFinanceLike = {
  budget?: number | null;
  capex_approved?: number | null;
  capex_incurred?: number | null;
  opex_approved?: number | null;
  opex_incurred?: number | null;
  benefits_target?: number | null;
  benefits_realised?: number | null;
  /** Legacy / imported aliases — accepted but not required in schema */
  approved_funding?: number | null;
  forecast?: number | null;
  forecast_at_completion?: number | null;
  fac?: number | null;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function projectApprovedFunding(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  const explicit = num(p.approved_funding);
  if (explicit) return explicit;
  const budget = num(p.budget);
  if (budget) return budget;
  return num(p.capex_approved) + num(p.opex_approved);
}

export function projectIncurred(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  return num(p.capex_incurred) + num(p.opex_incurred);
}

export function projectForecast(p: ProjectFinanceLike | null | undefined): number {
  if (!p) return 0;
  const fac = num(p.forecast_at_completion || p.fac || p.forecast);
  if (fac) return fac;
  const approved = num(p.capex_approved) + num(p.opex_approved);
  if (approved) return approved;
  const budget = num(p.budget);
  return budget ? budget * 1.05 : 0;
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
