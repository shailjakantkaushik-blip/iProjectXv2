/**
 * Investment Committee pack — derived from live demand, stage gates,
 * ranked investments, project finance, and RAID decisions.
 * Does not duplicate stores: the page re-reads the same tables as Demand,
 * Stage Gates, Prioritisation, Financials, Decisions, and Governance Channel.
 */

import {
  projectApprovedFunding,
  projectCapexApproved,
  projectForecast,
  projectIncurred,
  projectOpexApproved,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import { isActiveGateStatus } from "@/lib/project-phase";
import { isDecisionAwaiting, type DecisionOutcomeLike } from "@/lib/decision-approval";
import { rankPortfolioInvestments, type RankedInvestment } from "@/lib/executive-intelligence";

export const IC_FORUM_NAME = "Investment Committee";

const CLOSED_PROJECT = /^(closed|complete|completed|cancelled|canceled|archived)$/i;
const OPEN_DEMAND = new Set(["idea", "screening", "business case", "on hold"]);

export function normForum(s: string | null | undefined) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Match RAID `forum` to the live IC channel name, plus common aliases. */
export function isInvestmentCommitteeForum(
  forum: string | null | undefined,
  channelNames: string[] = [],
) {
  const f = normForum(forum);
  if (!f) return false;
  if (channelNames.some((n) => normForum(n) === f)) return true;
  if (f === "ic" || f === "the ic") return true;
  if (/investment committee/.test(f)) return true;
  if (/^investment board$/.test(f)) return true;
  return false;
}

export function pickInvestmentCommitteeChannel<
  T extends { name?: string | null; status?: string | null },
>(channels: T[]): T | null {
  const active = channels.filter((c) => {
    const st = String(c.status || "Active").toLowerCase();
    return st !== "retired" && st !== "paused";
  });
  const pool = active.length ? active : channels;
  const exact = pool.find((c) => normForum(c.name) === normForum(IC_FORUM_NAME));
  if (exact) return exact;
  const fuzzy = pool.find((c) => /investment\s*committee/.test(normForum(c.name)));
  return fuzzy ?? null;
}

/** Seed / Full Funding and Business Case gates are capital decisions, not delivery steering. */
export function isFundingGateName(name: string | null | undefined) {
  const n = String(name || "").toLowerCase();
  if (!n.trim()) return false;
  return /funding/.test(n) || /business\s*case/.test(n);
}

export function isOpenDemandAsk(status: string | null | undefined) {
  return OPEN_DEMAND.has(
    String(status || "")
      .trim()
      .toLowerCase(),
  );
}

export function isInFlightProject(status: string | null | undefined) {
  return !CLOSED_PROJECT.test(String(status || "").trim());
}

export type FundingGateAsk = {
  id: string;
  project_id: string;
  stream_id?: string | null;
  gate_name: string;
  status: string | null;
  planned_date: string | null;
};

/** One row per project + gate name. Prefer the project-level (null stream) row. */
export function canonicalFundingGateAsks(gates: FundingGateAsk[]): FundingGateAsk[] {
  const byKey = new Map<string, FundingGateAsk>();
  for (const g of gates) {
    if (!isFundingGateName(g.gate_name)) continue;
    if (!isActiveGateStatus(g.status)) continue;
    const key = `${g.project_id}::${String(g.gate_name).trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, g);
      continue;
    }
    const preferNew = !g.stream_id && prev.stream_id;
    if (preferNew) byKey.set(key, g);
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.planned_date || "").localeCompare(String(b.planned_date || "")),
  );
}

export type IcDemandAsk = {
  id: string;
  idea_name?: string | null;
  status?: string | null;
  sponsor?: string | null;
  estimated_cost?: number | null;
  estimated_benefit?: number | null;
  estimated_roi?: number | null;
  submitted_date?: string | null;
  project_id?: string | null;
};

export type IcProject = ProjectFinanceLike & {
  id: string;
  name?: string | null;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
  status?: string | null;
  priority?: string | null;
  rag?: string | null;
  rag_override?: string | null;
  benefits_target?: number | null;
  roi_percent?: number | null;
  payback_months?: number | null;
};

export type IcDecision = DecisionOutcomeLike & {
  id: string;
  raid_code?: string | null;
  project_id?: string | null;
  title?: string | null;
  forum?: string | null;
  sponsor?: string | null;
  decided_by?: string | null;
  decision_date?: string | null;
};

export type IcSpendRow = {
  projectId: string;
  label: string;
  code: string | null;
  budget: number;
  forecast: number;
  incurred: number;
  remaining: number;
  capexApproved: number;
  opexApproved: number;
};

export function inFlightSpendRows(projects: IcProject[]): IcSpendRow[] {
  return projects
    .filter((p) => isInFlightProject(p.status))
    .map((p) => {
      const budget = projectApprovedFunding(p);
      const forecast = projectForecast(p);
      const incurred = projectIncurred(p);
      return {
        projectId: p.id,
        label: p.name || p.project_code || "Project",
        code: p.project_code || null,
        budget,
        forecast,
        incurred,
        remaining: budget - incurred,
        capexApproved: projectCapexApproved(p),
        opexApproved: projectOpexApproved(p),
      };
    })
    .sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining) || b.budget - a.budget);
}

export function icDecisionsForForum(decisions: IcDecision[], channelNames: string[]) {
  return decisions.filter((d) => isInvestmentCommitteeForum(d.forum, channelNames));
}

export function buildInvestmentCommitteePack(opts: {
  projects: IcProject[];
  demand: IcDemandAsk[];
  gates: FundingGateAsk[];
  decisions: IcDecision[];
  benefits?: Array<{ project_id?: string; payback_months?: number | null }>;
  dependencies?: Array<{
    project_id: string;
    depends_on_project_id: string;
    status?: string | null;
  }>;
  channelNames?: string[];
}) {
  const channelNames = opts.channelNames?.length ? opts.channelNames : [IC_FORUM_NAME];
  const demandAsks = opts.demand.filter((d) => isOpenDemandAsk(d.status) && !d.project_id);
  const fundingAsks = canonicalFundingGateAsks(opts.gates);
  const decisions = icDecisionsForForum(opts.decisions, channelNames);
  const awaitingDecisions = decisions.filter((d) => isDecisionAwaiting(d));
  const ranked: RankedInvestment[] = rankPortfolioInvestments({
    projects: opts.projects.filter((p) => isInFlightProject(p.status)),
    dependencies: opts.dependencies || [],
    benefits: opts.benefits,
  });
  const spend = inFlightSpendRows(opts.projects);
  const budget = spend.reduce((s, r) => s + r.budget, 0);
  const forecast = spend.reduce((s, r) => s + r.forecast, 0);
  const incurred = spend.reduce((s, r) => s + r.incurred, 0);
  const capexApproved = spend.reduce((s, r) => s + r.capexApproved, 0);
  const opexApproved = spend.reduce((s, r) => s + r.opexApproved, 0);
  const demandCost = demandAsks.reduce((s, d) => s + Number(d.estimated_cost || 0), 0);
  const demandBenefit = demandAsks.reduce((s, d) => s + Number(d.estimated_benefit || 0), 0);

  return {
    demandAsks,
    fundingAsks,
    decisions,
    awaitingDecisions,
    ranked,
    spend,
    totals: {
      demandAskCount: demandAsks.length,
      fundingAskCount: fundingAsks.length,
      awaitingDecisionCount: awaitingDecisions.length,
      inFlightCount: spend.length,
      budget,
      forecast,
      incurred,
      remaining: budget - incurred,
      capexApproved,
      opexApproved,
      demandCost,
      demandBenefit,
    },
  };
}
