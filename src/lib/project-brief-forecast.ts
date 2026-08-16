import {
  forecastPhaseKey,
  resolveForecastStreamLabel,
  type ForecastPhaseRow,
  type ForecastStreamLike,
} from "@/lib/project-forecast";

export const FORECAST_TOTALS_PREFIX = "FORECAST TOTALS:";

export type BriefForecastPhaseRes = {
  id?: string;
  resource_id?: string | null;
  stream_id?: string | null;
  phase_name?: string | null;
  forecast_phase_id?: string | null;
  labor_cost?: number | null;
};

export type BriefForecastOtherCost = {
  forecast_phase_id?: string | null;
  amount?: number | null;
};

export type BriefForecastRow = {
  key: string;
  stream_id: string | null;
  stream_name: string;
  gate_name: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number;
  labor: number;
  other: number;
  total: number;
};

export function moneyBrief(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);
}

export function formatForecastTotalsLine(labor: number, other: number, total: number) {
  return `${FORECAST_TOTALS_PREFIX} Labor ${moneyBrief(labor)} · Other ${moneyBrief(other)} · Planned total ${moneyBrief(total)}.`;
}

export function mergeEstimateCommentary(existing: string | null | undefined, totalsLine: string) {
  const text = String(existing || "");
  const without = text
    .replace(new RegExp(`^${FORECAST_TOTALS_PREFIX}.*$(?:\\n+)?`, "m"), "")
    .trim();
  return without ? `${totalsLine}\n\n${without}` : totalsLine;
}

function laborForPhase(ph: ForecastPhaseRow, phaseRes: BriefForecastPhaseRes[]) {
  return phaseRes
    .filter((r) => {
      if (ph.id && r.forecast_phase_id === ph.id) return true;
      return r.phase_name === ph.gate_name && (r.stream_id || null) === (ph.stream_id || null);
    })
    .reduce((s, r) => s + Number(r.labor_cost || 0), 0);
}

function otherForPhase(ph: ForecastPhaseRow, otherCosts: BriefForecastOtherCost[]) {
  if (!ph.id) return 0;
  return otherCosts
    .filter((c) => c.forecast_phase_id === ph.id)
    .reduce((s, c) => s + Number(c.amount || 0), 0);
}

export function buildBriefForecastRows(
  phases: ForecastPhaseRow[],
  phaseRes: BriefForecastPhaseRes[],
  otherCosts: BriefForecastOtherCost[],
  streams: ForecastStreamLike[] = [],
): BriefForecastRow[] {
  return phases.map((ph) => {
    const labor = laborForPhase(ph, phaseRes);
    const other = otherForPhase(ph, otherCosts);
    return {
      key: forecastPhaseKey(ph),
      stream_id: ph.stream_id || null,
      stream_name: resolveForecastStreamLabel(ph.stream_id, ph.stream_name, streams),
      gate_name: ph.gate_name,
      start_date: ph.start_date || null,
      end_date: ph.end_date || null,
      duration_days: Number(ph.duration_days) || 0,
      labor,
      other,
      total: labor + other,
    };
  });
}

export function briefForecastTotals(rows: BriefForecastRow[]) {
  return rows.reduce(
    (acc, r) => ({
      labor: acc.labor + r.labor,
      other: acc.other + r.other,
      total: acc.total + r.total,
    }),
    { labor: 0, other: 0, total: 0 },
  );
}
