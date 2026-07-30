/**
 * Earned Value Management (EVM) — PV, EV, AC, SPI, CPI and derived metrics.
 *
 * BAC  = baseline_budget || budget || CapEx+OpEx approved
 * AC   = CapEx incurred + OpEx incurred (Actual Cost)
 * %C   = work-item weighted percent complete (by estimate hours), else 0
 * EV   = BAC × %C
 * PV   = BAC × schedule % (elapsed / planned duration), else cumulative monthly planned / BAC
 * SPI  = EV / PV
 * CPI  = EV / AC
 */

import { projectApprovedFunding, projectIncurred } from "@/lib/project-finance";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type EvmProjectLike = {
  id: string;
  project_code?: string | null;
  name?: string | null;
  status?: string | null;
  rag?: string | null;
  budget?: number | null;
  baseline_budget?: number | null;
  baseline_capex?: number | null;
  baseline_opex?: number | null;
  baseline_date?: string | null;
  baseline_label?: string | null;
  capex_approved?: number | null;
  opex_approved?: number | null;
  capex_incurred?: number | null;
  opex_incurred?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
};

export type EvmWorkItemLike = {
  project_id: string;
  percent_complete?: number | null;
  estimate_hours?: number | null;
  status?: string | null;
};

export type EvmMonthlyLike = {
  project_id: string;
  period_month: string;
  capex_planned?: number | null;
  opex_planned?: number | null;
  capex_actual?: number | null;
  opex_actual?: number | null;
};

export type EvmMetrics = {
  projectId: string;
  bac: number;
  ac: number;
  pctComplete: number;
  schedulePct: number;
  pv: number;
  ev: number;
  cv: number;
  sv: number;
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
  baselineLabel: string | null;
  asOf: string;
};

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Budget at Completion — prefer explicit baseline_budget. */
export function projectBac(p: EvmProjectLike): number {
  const baseline = num(p.baseline_budget);
  if (baseline > 0) return baseline;
  const baseParts = num(p.baseline_capex) + num(p.baseline_opex);
  if (baseParts > 0) return baseParts;
  return projectApprovedFunding(p);
}

/** Weighted % complete from work items (0–1). */
export function workItemPctComplete(items: EvmWorkItemLike[]): number {
  const active = items.filter((i) => {
    const st = String(i.status || "").toLowerCase();
    return st !== "cancelled";
  });
  if (!active.length) return 0;
  let weight = 0;
  let earned = 0;
  for (const i of active) {
    const w = Math.max(num(i.estimate_hours), 1);
    const pct = clamp01(num(i.percent_complete) / 100);
    // Done ⇒ 100% even if percent_complete lagged
    const done = String(i.status || "").toLowerCase() === "done" ? 1 : pct;
    weight += w;
    earned += w * done;
  }
  return weight > 0 ? earned / weight : 0;
}

/** Planned schedule progress 0–1 from project date window vs as-of. */
export function schedulePctComplete(p: EvmProjectLike, asOfIso: string): number {
  const asOf = parseIso(asOfIso) || new Date();
  const start =
    parseIso(p.actual_start_date) ||
    parseIso(p.planned_start_date) ||
    parseIso(p.start_date) ||
    parseIso(p.baseline_date);
  const end = parseIso(p.planned_end_date) || parseIso(p.end_date) || parseIso(p.actual_end_date);
  if (!start || !end || end <= start) return 0;
  if (asOf <= start) return 0;
  if (asOf >= end) return 1;
  return clamp01(daysBetween(start, asOf) / daysBetween(start, end));
}

/** Cumulative planned $ through as-of month from monthly financials. */
export function cumulativePlanned(
  rows: EvmMonthlyLike[],
  asOfIso: string,
): number {
  const asOfMonth = String(asOfIso).slice(0, 7);
  return rows.reduce((sum, r) => {
    const m = String(r.period_month || "").slice(0, 7);
    if (!m || m > asOfMonth) return sum;
    return sum + num(r.capex_planned) + num(r.opex_planned);
  }, 0);
}

export function computeProjectEvm(opts: {
  project: EvmProjectLike;
  workItems: EvmWorkItemLike[];
  monthly?: EvmMonthlyLike[];
  asOf?: string;
}): EvmMetrics {
  const asOf = (opts.asOf || new Date().toISOString()).slice(0, 10);
  const p = opts.project;
  const bac = projectBac(p);
  const ac = projectIncurred(p);
  const pctComplete = workItemPctComplete(opts.workItems);
  const schedulePct = schedulePctComplete(p, asOf);

  // PV: prefer schedule %, but if monthly plan exists use max(schedule×BAC, cum planned)
  let pv = bac * schedulePct;
  if (opts.monthly?.length) {
    const cumPlan = cumulativePlanned(opts.monthly, asOf);
    if (cumPlan > 0) pv = Math.max(pv, Math.min(bac || cumPlan, cumPlan));
  }

  const ev = bac * pctComplete;
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const eac = cpi && cpi > 0 ? bac / cpi : bac > 0 ? bac : null;
  const etc = eac != null ? eac - ac : null;
  const vac = eac != null ? bac - eac : null;
  // To-Complete Performance Index (BAC based)
  const remaining = bac - ev;
  const tcpi = bac - ac > 0 ? remaining / (bac - ac) : null;

  return {
    projectId: p.id,
    bac,
    ac,
    pctComplete,
    schedulePct,
    pv,
    ev,
    cv,
    sv,
    cpi,
    spi,
    eac,
    etc,
    vac,
    tcpi,
    baselineLabel: p.baseline_label || null,
    asOf,
  };
}

export function evmHealth(cpi: number | null, spi: number | null): "Green" | "Amber" | "Red" {
  const worst = Math.min(cpi ?? 1, spi ?? 1);
  if (worst >= 0.95) return "Green";
  if (worst >= 0.85) return "Amber";
  return "Red";
}

export function formatIndex(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
