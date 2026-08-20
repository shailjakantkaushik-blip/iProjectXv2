/** Demand pipeline stages shown on the register, funnel, and Data Editor. */

export const DEMAND_STAGES = [
  "Idea",
  "Screening",
  "Business Case",
  "Approved",
  "Rejected",
  "On Hold",
] as const;

export type DemandStage = (typeof DEMAND_STAGES)[number];

export const DEMAND_STAGE_COLORS: Record<string, string> = {
  Idea: "#94a3b8",
  Screening: "#3b82f6",
  Assessment: "#3b82f6",
  "Business Case": "#8b5cf6",
  Approved: "#22c55e",
  Rejected: "#ef4444",
  "On Hold": "#f59e0b",
};

export function demandStageOptions(existing: Array<{ status?: string | null }> = []) {
  const extra = new Set<string>();
  for (const row of existing) {
    const s = String(row.status || "").trim();
    if (s && !(DEMAND_STAGES as readonly string[]).includes(s)) extra.add(s);
  }
  return [...DEMAND_STAGES, ...[...extra].sort()];
}

export function demandPaybackMonths(idea: {
  estimated_cost?: number | null;
  estimated_benefit?: number | null;
}) {
  const cost = Number(idea.estimated_cost || 0);
  const benefit = Number(idea.estimated_benefit || 0);
  if (!(cost > 0) || !(benefit > 0)) return null;
  return Math.round((cost / benefit) * 12 * 10) / 10;
}

export function impliedDemandRoi(cost: number, benefit: number) {
  if (!(cost > 0)) return null;
  return Math.round((benefit / cost) * 1000) / 10;
}
