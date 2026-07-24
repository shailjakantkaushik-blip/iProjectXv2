/**
 * Portfolio health helpers — align cockpit / segmentation with canonical
 * `projects.portfolio` and compute Schedule/Financial/Delivery/Benefit RAGs
 * (ported from PMO_ENTERPRISE_TOOL/utils/portfolio_engine.py).
 */

import {
  projectApprovedFunding,
  projectBenefitsRealised,
  projectBenefitsTarget,
  projectForecast,
  projectIncurred,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import { projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import { scheduleCompletionPct } from "@/lib/schedule-progress";

export const PORTFOLIO_CATEGORIES = [
  "Business Strategic",
  "IT Strategic",
  "CAPEX",
  "Unfunded",
] as const;

export type PortfolioCategory = (typeof PORTFOLIO_CATEGORIES)[number];

export type RagTone = "Green" | "Amber" | "Red";

export type ProjectHealthLike = ProjectFinanceLike & {
  id?: string;
  portfolio?: string | null;
  /** Legacy Excel / Streamlit alias — do not write; read as fallback only. */
  portfolio_category?: string | null;
  rag?: string | null;
  budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  pm_user_id?: string | null;
  sponsor?: string | null;
};

export type StageGateHealthLike = {
  project_id?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
};

/** Canonical portfolio label from a project row. */
export function projectPortfolio(p: ProjectHealthLike | null | undefined): string {
  const raw = String(p?.portfolio || p?.portfolio_category || "").trim();
  return raw || "Unassigned";
}

/** Governance channel derived from approved funding (matches executive dashboard). */
export function projectGovernanceChannel(
  p: ProjectHealthLike | null | undefined,
  threshold = 200_000,
): string {
  const funding = projectApprovedFunding(p);
  return funding > threshold ? `Channel B (>$${Math.round(threshold / 1000)}K)` : `Channel A (<$${Math.round(threshold / 1000)}K)`;
}

function normalizeRag(v: unknown): RagTone {
  const s = String(v || "").trim().toLowerCase();
  if (s === "red") return "Red";
  if (s === "amber" || s === "yellow") return "Amber";
  return "Green";
}

function worstRag(...tones: RagTone[]): RagTone {
  const rank = { Green: 0, Amber: 1, Red: 2 };
  return tones.reduce((w, t) => (rank[t] > rank[w] ? t : w), "Green" as RagTone);
}

export type ProjectHealthComputed = {
  portfolio: string;
  governance_channel: string;
  progress_percent: number;
  schedule_rag: RagTone;
  financial_rag: RagTone;
  delivery_rag: RagTone;
  benefit_rag: RagTone;
  overall_rag: RagTone;
};

/**
 * Compute health dimensions for one project.
 * Schedule uses time-elapsed vs calendar window; financial uses FAC vs funding;
 * benefit uses realised/target; delivery uses overdue stage gates or project RAG.
 */
export function computeProjectHealth(
  project: ProjectHealthLike,
  gates: StageGateHealthLike[] = [],
  nowMs: number = Date.now(),
): ProjectHealthComputed {
  const start = projectScheduleStart(project);
  const end = projectScheduleEnd(project);
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  const progress = scheduleCompletionPct(startMs, endMs, nowMs);

  // Schedule: progress vs elapsed fraction of the window
  let schedule_rag: RagTone = "Green";
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    const duration = endMs - startMs;
    const elapsed = Math.max(0, nowMs - startMs);
    const expected = Math.min(1, elapsed / duration);
    const actual = progress / 100;
    const variance = actual - expected;
    if (variance < -0.1) schedule_rag = "Red";
    else if (variance < -0.05) schedule_rag = "Amber";
  }

  const approved = projectApprovedFunding(project);
  const forecast = projectForecast(project);
  let financial_rag: RagTone = "Green";
  if (approved > 0) {
    const finVar = (forecast - approved) / approved;
    if (finVar > 0.1) financial_rag = "Red";
    else if (finVar > 0.05) financial_rag = "Amber";
  } else if (forecast > 0 || projectIncurred(project) > 0) {
    financial_rag = "Amber";
  }

  const benT = projectBenefitsTarget(project);
  const benR = projectBenefitsRealised(project);
  let benefit_rag: RagTone = "Green";
  if (benT > 0) {
    const rate = benR / benT;
    if (rate >= 0.7) benefit_rag = "Green";
    else if (rate >= 0.3) benefit_rag = "Amber";
    else benefit_rag = "Red";
  } else if (benR > 0) {
    benefit_rag = "Green";
  }

  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  let maxDaysLate = 0;
  for (const g of gates) {
    if (!g.planned_date) continue;
    const status = String(g.status || "").toLowerCase();
    if (status === "approved" || status === "complete" || status === "completed" || status === "passed") {
      continue;
    }
    const planned = new Date(g.planned_date);
    if (Number.isNaN(planned.getTime())) continue;
    planned.setHours(0, 0, 0, 0);
    if (planned >= today) continue;
    const days = Math.round((today.getTime() - planned.getTime()) / 86_400_000);
    if (days > maxDaysLate) maxDaysLate = days;
  }
  let delivery_rag: RagTone;
  if (gates.length > 0) {
    if (maxDaysLate < 1) delivery_rag = "Green";
    else if (maxDaysLate < 15) delivery_rag = "Amber";
    else delivery_rag = "Red";
  } else {
    delivery_rag = normalizeRag(project.rag);
  }

  const overall_rag = worstRag(schedule_rag, financial_rag, delivery_rag, benefit_rag);

  return {
    portfolio: projectPortfolio(project),
    governance_channel: projectGovernanceChannel(project),
    progress_percent: progress,
    schedule_rag,
    financial_rag,
    delivery_rag,
    benefit_rag,
    overall_rag,
  };
}
