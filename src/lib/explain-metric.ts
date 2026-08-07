/**
 * "Explain This" — build plain-language drivers for portfolio money KPIs.
 * Uses monthly financials, FTE labor, other OpEx, and milestone/gate slips.
 */

import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  projectBenefitsTarget,
  projectBenefitsRealised,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import type { MonthlyFinanceRow } from "@/lib/finance-lifecycle";
import { monthKey, sumMonthlyForecast, sumMonthlyActual, sumMonthlyPlanned } from "@/lib/finance-lifecycle";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type ExplainDriver = {
  label: string;
  detail?: string;
  /** Signed $ impact when known (positive = pushed the metric up). */
  impact?: number;
};

export type MetricExplanation = {
  title: string;
  headline: string;
  bullets: string[];
  drivers: ExplainDriver[];
  periodLabel?: string;
  /** Soft confidence — data completeness, not statistical. */
  confidence: "high" | "medium" | "low";
};

export type MilestoneLike = {
  name?: string | null;
  title?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
  due_date?: string | null;
};

export type StageGateLike = {
  gate_name?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
};

export type OtherCostLike = {
  amount?: number | null;
  category?: string | null;
  vendor?: string | null;
  vendor_name?: string | null;
  description?: string | null;
  period_month?: string | null;
  cost_date?: string | null;
};

function moneyShort(n: number): string {
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${sign}$${Math.round(v / 1_000)}K`;
  return `${sign}$${Math.round(v).toLocaleString()}`;
}

function monthLabel(iso: string): string {
  const d = new Date(monthKey(iso));
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function prevMonthKey(iso: string): string {
  const d = new Date(monthKey(iso));
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

function groupByMonth(rows: MonthlyFinanceRow[]): Map<string, MonthlyFinanceRow[]> {
  const m = new Map<string, MonthlyFinanceRow[]>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    const list = m.get(k) || [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

function slippedItems(items: (MilestoneLike | StageGateLike)[]): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (const g of items) {
    const name =
      ("gate_name" in g && g.gate_name) ||
      ("name" in g && g.name) ||
      ("title" in g && g.title) ||
      "Milestone";
    const planned = g.planned_date || ("due_date" in g ? g.due_date : null);
    if (!planned) continue;
    const p = new Date(planned);
    if (Number.isNaN(p.getTime())) continue;
    const status = String(g.status || "").toLowerCase();
    const done = /complete|closed|done|approved|passed/i.test(status) || !!g.actual_date;
    if (done && g.actual_date) {
      const a = new Date(g.actual_date);
      if (!Number.isNaN(a.getTime()) && a.getTime() > p.getTime() + 2 * 86_400_000) {
        const days = Math.round((a.getTime() - p.getTime()) / 86_400_000);
        out.push(`${name} slipped ${days} days`);
      }
      continue;
    }
    if (!done && p < today) {
      const days = Math.round((today.getTime() - p.getTime()) / 86_400_000);
      out.push(`${name} overdue by ${days} days`);
    }
  }
  return out;
}

/** Build MoM forecast explanation matching the product story. */
export function explainForecast(opts: {
  label?: string;
  currentForecast: number;
  monthly?: MonthlyFinanceRow[];
  milestones?: MilestoneLike[];
  gates?: StageGateLike[];
  otherCosts?: OtherCostLike[];
  projects?: ProjectFinanceLike[];
}): MetricExplanation {
  const label = opts.label || "Forecast";
  const monthly = opts.monthly || [];
  const byMonth = groupByMonth(monthly);
  const months = [...byMonth.keys()].sort();
  const nowKey = monthKey(new Date());
  const curKey = months.includes(nowKey)
    ? nowKey
    : months.filter((m) => m <= nowKey).pop() || months[months.length - 1];
  const priorKey = curKey ? prevMonthKey(curKey) : "";
  const curRows = curKey ? byMonth.get(curKey) || [] : [];
  const priorRows = priorKey ? byMonth.get(priorKey) || [] : [];

  const curMonthFc = sumMonthlyForecast(curRows);
  const priorMonthFc = sumMonthlyForecast(priorRows);
  const deltaMonth = curMonthFc - priorMonthFc;

  // Prefer register FAC MoM proxy: total forecast sum change isn't historical —
  // use current-month forecast delta as the primary narrative when available.
  const delta =
    priorRows.length || curRows.length
      ? deltaMonth
      : opts.currentForecast - (opts.projects || []).reduce((s, p) => s + projectApprovedFunding(p), 0);

  const drivers: ExplainDriver[] = [];
  const bullets: string[] = [];

  // FTE plan vs actual (current month, fall back to all months)
  const fteScope = curRows.length ? curRows : monthly;
  const ftePlan = fteScope.reduce((s, r) => s + num(r.opex_labor_planned), 0);
  const fteActual = fteScope.reduce((s, r) => s + num(r.opex_labor_actual), 0);
  if (ftePlan > 0 && fteActual > 0) {
    const pctAbove = ((fteActual - ftePlan) / ftePlan) * 100;
    if (Math.abs(pctAbove) >= 3) {
      const dir = pctAbove > 0 ? "above" : "below";
      const text = `Actual FTE is ${Math.abs(pctAbove).toFixed(0)}% ${dir} plan`;
      bullets.push(text);
      drivers.push({
        label: text,
        detail: `FTE $ ${moneyShort(fteActual)} vs plan ${moneyShort(ftePlan)}`,
        impact: fteActual - ftePlan,
      });
    }
  } else if (fteActual > 0 && ftePlan <= 0) {
    bullets.push(`Actual FTE labor recorded at ${moneyShort(fteActual)} (no plan baseline)`);
    drivers.push({ label: "Actual FTE labor", impact: fteActual });
  }

  // Milestone / gate slips
  const slips = [
    ...slippedItems(opts.milestones || []),
    ...slippedItems(opts.gates || []),
  ];
  if (slips.length) {
    const n = slips.length;
    const text =
      n === 1
        ? `One milestone slipped (${slips[0]})`
        : `${n} milestones slipped (e.g. ${slips[0]})`;
    bullets.push(text);
    drivers.push({
      label: text,
      detail: slips.slice(0, 4).join("; "),
    });
  }

  // Vendor / other OpEx in current (or recent) month
  const costScope = (opts.otherCosts || []).filter((c) => {
    const pm = c.period_month || c.cost_date;
    if (!pm || !curKey) return true;
    return monthKey(pm) === curKey || monthKey(pm) === priorKey;
  });
  const vendorCosts = costScope.filter((c) =>
    /vendor|contractor|consult/i.test(
      String(c.category || c.vendor || c.vendor_name || c.description || ""),
    ),
  );
  const vendorTotal = vendorCosts.reduce((s, c) => s + num(c.amount), 0);
  const otherTotal = costScope.reduce((s, c) => s + num(c.amount), 0);
  if (vendorTotal > 0) {
    const text = `Vendor cost ${delta >= 0 ? "increased" : "contributed"} by ${moneyShort(vendorTotal)}`;
    bullets.push(text);
    drivers.push({
      label: text,
      detail: vendorCosts
        .slice(0, 3)
        .map((c) => c.vendor || c.vendor_name || c.description || c.category || "Vendor")
        .join(", "),
      impact: vendorTotal,
    });
  } else if (otherTotal > 0) {
    const text = `Other OpEx of ${moneyShort(otherTotal)} in the recent period`;
    bullets.push(text);
    drivers.push({ label: text, impact: otherTotal });
  }

  // Monthly other actual from financials_monthly
  const otherActual = fteScope.reduce((s, r) => s + num(r.opex_other_actual), 0);
  if (otherActual > 0 && vendorTotal <= 0) {
    const text = `Other OpEx actual ${moneyShort(otherActual)}`;
    if (!bullets.some((b) => /Other OpEx/i.test(b))) {
      bullets.push(text);
      drivers.push({ label: text, impact: otherActual });
    }
  }

  // Planned vs forecast pressure
  const approved = (opts.projects || []).reduce((s, p) => s + projectApprovedFunding(p), 0);
  if (approved > 0 && opts.currentForecast > approved * 1.02) {
    const over = opts.currentForecast - approved;
    const text = `Forecast is ${moneyShort(over)} above approved funding`;
    bullets.push(text);
    drivers.push({ label: text, impact: over });
  }

  if (!bullets.length) {
    const planned = sumMonthlyPlanned(monthly);
    const actual = sumMonthlyActual(monthly);
    if (planned > 0) {
      bullets.push(
        `Portfolio actuals are ${moneyShort(actual)} against ${moneyShort(planned)} planned in monthly cashflow`,
      );
    }
    bullets.push(
      `Current ${label.toLowerCase()} is ${moneyShort(opts.currentForecast)}` +
        (approved ? ` vs ${moneyShort(approved)} approved funding` : ""),
    );
  }

  const direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "held steady";
  const headline =
    Math.abs(delta) >= 1
      ? `${label} ${direction} by ${moneyShort(Math.abs(delta))} over the last month primarily because:`
      : `${label} is ${moneyShort(opts.currentForecast)}. Key drivers:`;

  const confidence: MetricExplanation["confidence"] =
    monthly.length && (ftePlan > 0 || slips.length || vendorTotal > 0)
      ? "high"
      : monthly.length
        ? "medium"
        : "low";

  return {
    title: label,
    headline,
    bullets: bullets.slice(0, 6),
    drivers: drivers.slice(0, 6),
    periodLabel: curKey ? `${monthLabel(priorKey || curKey)} → ${monthLabel(curKey)}` : undefined,
    confidence,
  };
}

export function explainActualSpend(opts: {
  label?: string;
  actual: number;
  monthly?: MonthlyFinanceRow[];
  otherCosts?: OtherCostLike[];
  projects?: ProjectFinanceLike[];
}): MetricExplanation {
  const label = opts.label || "Actual spend";
  const monthly = opts.monthly || [];
  const approved = (opts.projects || []).reduce((s, p) => s + projectApprovedFunding(p), 0);
  const fteActual = monthly.reduce((s, r) => s + num(r.opex_labor_actual), 0);
  const ftePlan = monthly.reduce((s, r) => s + num(r.opex_labor_planned), 0);
  const otherActual = monthly.reduce((s, r) => s + num(r.opex_other_actual), 0);
  const bullets: string[] = [];
  const drivers: ExplainDriver[] = [];

  if (approved > 0) {
    const pct = (opts.actual / approved) * 100;
    bullets.push(`${pct.toFixed(1)}% of approved funding incurred to date`);
  }
  if (fteActual > 0) {
    const text =
      ftePlan > 0
        ? `Labor / FTE actual ${moneyShort(fteActual)} (${((fteActual / ftePlan) * 100).toFixed(0)}% of plan)`
        : `Labor / FTE actual ${moneyShort(fteActual)}`;
    bullets.push(text);
    drivers.push({ label: text, impact: fteActual });
  }
  if (otherActual > 0) {
    bullets.push(`Other OpEx actual ${moneyShort(otherActual)}`);
    drivers.push({ label: "Other OpEx", impact: otherActual });
  }
  const vendor = (opts.otherCosts || []).reduce((s, c) => s + num(c.amount), 0);
  if (vendor > 0) {
    bullets.push(`Vendor / other cost lines total ${moneyShort(vendor)}`);
  }
  if (!bullets.length) {
    bullets.push(`Incurred to date: ${moneyShort(opts.actual)}`);
  }

  return {
    title: label,
    headline: `${label} is ${moneyShort(opts.actual)}. Breakdown:`,
    bullets,
    drivers,
    confidence: monthly.length ? "medium" : "low",
  };
}

export function explainBudget(opts: {
  label?: string;
  budget: number;
  forecast?: number;
  projects?: ProjectFinanceLike[];
}): MetricExplanation {
  const label = opts.label || "Budget";
  const projects = opts.projects || [];
  const capex = projects.reduce((s, p) => s + num((p as any).capex_approved), 0);
  const opex = projects.reduce((s, p) => s + num((p as any).opex_approved), 0);
  const bullets: string[] = [];
  if (capex || opex) {
    bullets.push(`CapEx approved ${moneyShort(capex)} · OpEx approved ${moneyShort(opex)}`);
  }
  if (opts.forecast != null && opts.forecast > 0) {
    const delta = opts.forecast - opts.budget;
    bullets.push(
      delta === 0
        ? "Forecast matches approved funding"
        : `Forecast is ${moneyShort(Math.abs(delta))} ${delta > 0 ? "above" : "below"} budget`,
    );
  }
  if (projects.length) {
    bullets.push(`Across ${projects.length} project${projects.length === 1 ? "" : "s"}`);
  }
  if (!bullets.length) bullets.push(`Approved funding ${moneyShort(opts.budget)}`);

  return {
    title: label,
    headline: `${label} is ${moneyShort(opts.budget)}.`,
    bullets,
    drivers: bullets.map((b) => ({ label: b })),
    confidence: projects.length ? "medium" : "low",
  };
}

export function explainBenefits(opts: {
  label?: string;
  target: number;
  realised: number;
}): MetricExplanation {
  const label = opts.label || "Benefits";
  const rate = opts.target > 0 ? (opts.realised / opts.target) * 100 : 0;
  const bullets = [
    `Expected / target ${moneyShort(opts.target)}`,
    `Realised ${moneyShort(opts.realised)} (${rate.toFixed(0)}% of target)`,
    rate < 85 && opts.realised > 0
      ? "Delivery progress does not guarantee full business-value realisation"
      : rate >= 85
        ? "Benefit realisation is on track versus target"
        : "No realised benefits recorded yet",
  ].filter(Boolean) as string[];

  return {
    title: label,
    headline: `${label}: realisation at ${rate.toFixed(0)}%.`,
    bullets,
    drivers: bullets.map((b) => ({ label: b })),
    confidence: opts.target > 0 ? "medium" : "low",
  };
}

export function explainRemaining(opts: {
  label?: string;
  remaining: number;
  approved: number;
  incurred: number;
}): MetricExplanation {
  const label = opts.label || "Remaining budget";
  const bullets = [
    `Approved ${moneyShort(opts.approved)} − incurred ${moneyShort(opts.incurred)}`,
    opts.approved > 0
      ? `${((opts.incurred / opts.approved) * 100).toFixed(1)}% of funding consumed`
      : "No approved funding on register",
  ];
  return {
    title: label,
    headline: `${label} is ${moneyShort(opts.remaining)}.`,
    bullets,
    drivers: bullets.map((b) => ({ label: b })),
    confidence: opts.approved > 0 ? "high" : "low",
  };
}

/** Generic helper when only a label + value + optional notes are known. */
export function explainGeneric(opts: {
  label: string;
  value: number | string;
  bullets?: string[];
  headline?: string;
}): MetricExplanation {
  const bullets =
    opts.bullets?.length
      ? opts.bullets
      : ["Based on the current portfolio register and related execution data."];
  return {
    title: opts.label,
    headline: opts.headline || `${opts.label}: ${opts.value}`,
    bullets,
    drivers: bullets.map((b) => ({ label: b })),
    confidence: "low",
  };
}

/** Portfolio snapshot used by executive surfaces. */
export function explainPortfolioSnapshot(opts: {
  projects: ProjectFinanceLike[];
  monthly?: MonthlyFinanceRow[];
  milestones?: MilestoneLike[];
  gates?: StageGateLike[];
  otherCosts?: OtherCostLike[];
}): {
  forecast: MetricExplanation;
  actual: MetricExplanation;
  budget: MetricExplanation;
  remaining: MetricExplanation;
  benefits: MetricExplanation;
} {
  const projects = opts.projects;
  const forecast = projects.reduce((s, p) => s + projectForecast(p), 0);
  const actual = projects.reduce((s, p) => s + projectIncurred(p), 0);
  const budget = projects.reduce((s, p) => s + projectApprovedFunding(p), 0);
  const benefitsTarget = projects.reduce((s, p) => s + projectBenefitsTarget(p), 0);
  const benefitsRealised = projects.reduce((s, p) => s + projectBenefitsRealised(p), 0);

  return {
    forecast: explainForecast({
      label: "Forecast at Completion",
      currentForecast: forecast,
      monthly: opts.monthly,
      milestones: opts.milestones,
      gates: opts.gates,
      otherCosts: opts.otherCosts,
      projects,
    }),
    actual: explainActualSpend({
      label: "Actual spend to date",
      actual,
      monthly: opts.monthly,
      otherCosts: opts.otherCosts,
      projects,
    }),
    budget: explainBudget({
      label: "Approved funding",
      budget,
      forecast,
      projects,
    }),
    remaining: explainRemaining({
      remaining: Math.max(0, budget - actual),
      approved: budget,
      incurred: actual,
    }),
    benefits: explainBenefits({
      label: "Benefits",
      target: benefitsTarget,
      realised: benefitsRealised,
    }),
  };
}
