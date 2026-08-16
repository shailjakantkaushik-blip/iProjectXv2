/**
 * Portfolio health helpers — align cockpit / segmentation with canonical
 * `projects.portfolio` and compute Schedule/Financial/Delivery/Benefit RAGs.
 *
 * Prefer `evaluateProjectHealth` from `@/lib/project-health-engine` for the
 * full weighted score, early warnings, predictive health, and auto-forecast.
 */

import {
  projectApprovedFunding,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import { projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";
import { scheduleCompletionPct } from "@/lib/schedule-progress";
import {
  evaluateProjectHealth,
  type HealthEngineInput,
  type HealthEngineResult,
} from "@/lib/project-health-engine";

export {
  evaluateProjectHealth,
  scoreToRag,
  HEALTH_DIMENSION_WEIGHTS,
  HEALTH_DIMENSION_LABELS,
} from "@/lib/project-health-engine";
export type { HealthEngineResult, HealthEngineInput } from "@/lib/project-health-engine";

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

/**
 * Normalize free-text portfolio labels to the four canonical categories when
 * possible (case/spacing insensitive). Unknown non-empty values are kept so
 * they still segment instead of vanishing into zeros.
 */
export function normalizePortfolioCategory(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return "Unassigned";
  const key = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  for (const cat of PORTFOLIO_CATEGORIES) {
    if (cat.toLowerCase() === key) return cat;
  }
  // Common aliases from Excel / Streamlit imports
  if (key === "business" || key === "biz strategic" || key === "business strategy") {
    return "Business Strategic";
  }
  if (key === "it" || key === "it run" || key === "it strategy" || key === "technology strategic") {
    return "IT Strategic";
  }
  if (key === "cap ex" || key === "capital" || key === "capital expenditure") {
    return "CAPEX";
  }
  if (key === "un funded" || key === "not funded" || key === "un-funded") {
    return "Unfunded";
  }
  if (key === "n/a" || key === "na" || key === "none" || key === "-" || key === "unassigned") {
    return "Unassigned";
  }
  return s;
}

/** Canonical portfolio label from a project row. */
export function projectPortfolio(p: ProjectHealthLike | null | undefined): string {
  return normalizePortfolioCategory(p?.portfolio || p?.portfolio_category);
}

/** Build ordered segmentation bucket labels for a project set. */
export function portfolioSegmentLabels(projects: ProjectHealthLike[]): string[] {
  const seen = new Set<string>();
  for (const p of projects) seen.add(projectPortfolio(p));

  const extras = [...seen]
    .filter(
      (k) =>
        !(PORTFOLIO_CATEGORIES as readonly string[]).includes(k) && k !== "Unassigned",
    )
    .sort((a, b) => a.localeCompare(b));

  const labels = [...PORTFOLIO_CATEGORIES, ...extras];
  if (seen.has("Unassigned")) labels.push("Unassigned");
  return labels;
}

/** Governance channel derived from approved funding (matches executive dashboard). */
export function projectGovernanceChannel(
  p: ProjectHealthLike | null | undefined,
  threshold = 200_000,
): string {
  const funding = projectApprovedFunding(p);
  return funding > threshold ? `Channel B (>$${Math.round(threshold / 1000)}K)` : `Channel A (<$${Math.round(threshold / 1000)}K)`;
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
  /** Weighted 0–100 score from the Project Health Engine. */
  health_score: number;
  engine: HealthEngineResult;
};

function dimRag(engine: HealthEngineResult, key: string, fallback: RagTone): RagTone {
  return (engine.dimensions.find((d) => d.key === key)?.rag as RagTone) || fallback;
}

/**
 * Compute health for one project via the weighted Health Engine.
 * `overall_rag` is derived from the score (not manual entry).
 * Pass the same RAID / monthly / allocation rows used on Infographic / Quick view
 * so 30-day RAG matches those pages.
 */
export function computeProjectHealth(
  project: ProjectHealthLike,
  gates: StageGateHealthLike[] = [],
  extras?: Omit<Partial<HealthEngineInput>, "project" | "gates">,
): ProjectHealthComputed {
  const nowMs = extras?.nowMs ?? Date.now();
  const engine = evaluateProjectHealth({
    project,
    gates,
    nowMs,
    workItems: extras?.workItems,
    risks: extras?.risks,
    dependencies: extras?.dependencies,
    changeRequests: extras?.changeRequests,
    allocations: extras?.allocations,
    monthly: extras?.monthly,
    previousScore: extras?.previousScore,
  });

  const start = projectScheduleStart(project);
  const end = projectScheduleEnd(project);
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  const progress = scheduleCompletionPct(startMs, endMs, nowMs);

  return {
    portfolio: projectPortfolio(project),
    governance_channel: projectGovernanceChannel(project),
    progress_percent: Math.round(engine.workPct * 100) || progress,
    schedule_rag: dimRag(engine, "schedule", "Green"),
    financial_rag: dimRag(engine, "financial", "Green"),
    delivery_rag: dimRag(engine, "delivery", "Green"),
    benefit_rag: dimRag(engine, "benefits", "Green"),
    overall_rag: engine.rag,
    health_score: engine.score,
    engine,
  };
}
