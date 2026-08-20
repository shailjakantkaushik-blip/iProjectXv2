/**
 * Portfolio Pulse — aggregate health areas + week-over-week event delta.
 * Builds on evaluateProjectHealth; trends use org-scoped local snapshots.
 */

import {
  evaluateProjectHealth,
  scoreToRag,
  type HealthDimensionKey,
  type HealthEngineResult,
  type RagTone,
} from "@/lib/project-health-engine";
import { projectApprovedFunding, projectForecast } from "@/lib/project-finance";
import { effectiveRag, isRagOverridden, worstRagOf } from "@/lib/ops-enhancements";

export type PulseAreaKey =
  "financial" | "delivery" | "resource" | "risk" | "benefits" | "dependencies";

export const PULSE_AREAS: { key: PulseAreaKey; label: string }[] = [
  { key: "financial", label: "Financial" },
  { key: "delivery", label: "Delivery" },
  { key: "resource", label: "Resources" },
  { key: "risk", label: "Risk" },
  { key: "benefits", label: "Benefits" },
  { key: "dependencies", label: "Dependencies" },
];

export type PulseTrend = "up" | "down" | "flat";

export type PulseAreaRow = {
  key: PulseAreaKey;
  label: string;
  score: number;
  status: RagTone;
  trend: PulseTrend;
  delta: number;
};

export type PulseWeekChange = {
  projectsDeteriorated: number;
  projectsImproved: number;
  forecastVarianceDelta: number;
  risksBecameCritical: number;
  decisionsBecameOverdue: number;
  bullets: string[];
};

export type PortfolioPulseResult = {
  healthPct: number;
  rag: RagTone;
  /** True when at least one in-scope project has a sponsor RAG override. */
  ragManual: boolean;
  /** Worst register/override RAG — same colour as `rag` when overrides are applied. */
  steeringRag: RagTone;
  areas: PulseAreaRow[];
  week: PulseWeekChange;
  projectCount: number;
  capturedAt: string;
  comparedToAt: string | null;
  /** Internal — used to persist next baseline without re-scoring. */
  projectScores: Record<string, number>;
  forecastVariance: number;
};

export type PulseProjectInput = {
  project: any;
  workItems?: any[];
  gates?: any[];
  risks?: any[];
  dependencies?: any[];
  changeRequests?: any[];
  allocations?: any[];
  monthly?: any[];
  benefitLines?: any[];
  fyAllocations?: any[];
};

export type PulseSnapshot = {
  orgId: string;
  capturedAt: string;
  healthPct: number;
  areaScores: Record<PulseAreaKey, number>;
  projectScores: Record<string, number>;
  forecastVariance: number;
  criticalRiskIds: string[];
  overdueDecisionIds: string[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, n));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function trendFromDelta(delta: number): PulseTrend {
  if (delta >= 2) return "up";
  if (delta <= -2) return "down";
  return "flat";
}

export function pulseTrendGlyph(t: PulseTrend): string {
  if (t === "up") return "↗";
  if (t === "down") return "↘";
  return "→";
}

export function pulseRagEmoji(rag: RagTone): string {
  if (rag === "Green") return "🟢";
  if (rag === "Amber") return "🟠";
  return "🔴";
}

function storageKey(orgId: string, scope = "all") {
  return scope && scope !== "all"
    ? `iprojectx.portfolioPulse.${orgId}.${scope}`
    : `iprojectx.portfolioPulse.${orgId}`;
}

export function readPulseSnapshot(orgId: string, scope = "all"): PulseSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(orgId, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseSnapshot;
    if (!parsed?.orgId || parsed.orgId !== orgId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePulseSnapshot(snapshot: PulseSnapshot, scope = "all"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(snapshot.orgId, scope), JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

function isCriticalRisk(r: any): boolean {
  const s = String(r.status || "").toLowerCase();
  if (/closed|mitigated|accepted|resolved/.test(s)) return false;
  const p = String(r.priority || r.rating || r.residual_rating || "").toLowerCase();
  if (p.includes("critical") || p.includes("very high") || p === "red") return true;
  if (Number(r.severity || 0) >= 12) return true;
  const score = Number(r.probability || 0) * Number(r.impact || 0);
  return score >= 15;
}

function isOverdueDecision(d: any, nowMs: number): boolean {
  const outcome = String(d.outcome || d.status || "").toLowerCase();
  if (/approved|rejected|closed|cancelled|complete/.test(outcome)) return false;
  const due = d.decision_date || d.due_date;
  if (!due) return false;
  const t = new Date(due).getTime();
  if (!Number.isFinite(t)) return false;
  const day = new Date(nowMs);
  day.setHours(0, 0, 0, 0);
  return t < day.getTime();
}

function dimScore(engine: HealthEngineResult, key: HealthDimensionKey): number {
  return engine.dimensions.find((d) => d.key === key)?.score ?? 0;
}

/** Evaluate pulse for the portfolio. */
export function buildPortfolioPulse(opts: {
  orgId: string;
  projects: PulseProjectInput[];
  allRisks?: any[];
  allDecisions?: any[];
  previous?: PulseSnapshot | null;
  nowMs?: number;
  fyStartMonth?: number | null;
}): PortfolioPulseResult {
  const nowMs = opts.nowMs ?? Date.now();
  const previous = opts.previous ?? null;
  const engines: { id: string; engine: HealthEngineResult; forecastVar: number; rag: RagTone; ragManual: boolean }[] = [];

  for (const row of opts.projects) {
    const p = row.project;
    if (!p?.id) continue;
    const engine = evaluateProjectHealth({
      project: p,
      workItems: row.workItems,
      gates: row.gates,
      risks: row.risks,
      dependencies: row.dependencies,
      changeRequests: row.changeRequests,
      allocations: row.allocations,
      monthly: row.monthly,
      benefitLines: row.benefitLines,
      fyAllocations: row.fyAllocations,
      fyStartMonth: opts.fyStartMonth,
      nowMs,
    });
    const approved = projectApprovedFunding(p);
    const fac = Math.max(projectForecast(p), engine.forecast.forecastFinalCost);
    const shown = effectiveRag(p, engine.rag);
    engines.push({
      id: p.id,
      engine,
      forecastVar: fac - approved,
      rag: shown === "Red" || shown === "Amber" || shown === "Green" ? shown : engine.rag,
      ragManual: isRagOverridden(p),
    });
  }

  const healthPct = Math.round(avg(engines.map((e) => e.engine.score)));
  const rag = engines.length ? worstRagOf(engines.map((e) => e.rag)) : scoreToRag(healthPct);
  const ragManual = engines.some((e) => e.ragManual);
  const steeringRag = rag;

  const areaScores = {} as Record<PulseAreaKey, number>;
  for (const area of PULSE_AREAS) {
    areaScores[area.key] = Math.round(
      avg(engines.map((e) => dimScore(e.engine, area.key as HealthDimensionKey))),
    );
  }

  const areas: PulseAreaRow[] = PULSE_AREAS.map((area) => {
    const score = areaScores[area.key] || 0;
    const prev = previous?.areaScores?.[area.key];
    const delta = prev != null ? score - prev : 0;
    return {
      key: area.key,
      label: area.label,
      score,
      status: scoreToRag(score),
      trend: prev == null ? "flat" : trendFromDelta(delta),
      delta,
    };
  });

  const projectScores: Record<string, number> = {};
  for (const e of engines) projectScores[e.id] = e.engine.score;

  let deteriorated = 0;
  let improved = 0;
  if (previous?.projectScores) {
    for (const e of engines) {
      const prev = previous.projectScores[e.id];
      if (prev == null) continue;
      const delta = e.engine.score - prev;
      if (delta <= -3) deteriorated += 1;
      else if (delta >= 3) improved += 1;
    }
  }

  const forecastVariance = engines.reduce((s, e) => s + e.forecastVar, 0);
  const forecastVarianceDelta =
    previous?.forecastVariance != null ? forecastVariance - previous.forecastVariance : 0;

  const criticalRisks = (opts.allRisks ?? []).filter(isCriticalRisk);
  const criticalRiskIds = criticalRisks.map((r) => String(r.id)).filter(Boolean);
  const prevCritical = new Set(previous?.criticalRiskIds ?? []);
  // Prefer newly-critical vs prior snapshot; fall back to updated_at in last 7d.
  let risksBecameCritical = criticalRiskIds.filter((id) => !prevCritical.has(id)).length;
  if (!previous) {
    const weekAgo = nowMs - WEEK_MS;
    risksBecameCritical = criticalRisks.filter((r) => {
      const u = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return u >= weekAgo;
    }).length;
  }

  const overdueDecisions = (opts.allDecisions ?? []).filter((d) => isOverdueDecision(d, nowMs));
  const overdueDecisionIds = overdueDecisions.map((d) => String(d.id)).filter(Boolean);
  const prevOverdue = new Set(previous?.overdueDecisionIds ?? []);
  let decisionsBecameOverdue = overdueDecisionIds.filter((id) => !prevOverdue.has(id)).length;
  if (!previous) {
    decisionsBecameOverdue = overdueDecisions.length;
  }

  const bullets: string[] = [];
  if (deteriorated)
    bullets.push(`${deteriorated} project${deteriorated === 1 ? "" : "s"} deteriorated`);
  if (improved) bullets.push(`${improved} project${improved === 1 ? "" : "s"} improved`);
  if (Math.abs(forecastVarianceDelta) >= 1000) {
    const abs = Math.round(Math.abs(forecastVarianceDelta));
    const dir = forecastVarianceDelta >= 0 ? "increased" : "decreased";
    bullets.push(`$${abs.toLocaleString()} forecast variance ${dir}`);
  }
  if (risksBecameCritical) {
    bullets.push(
      `${risksBecameCritical} risk${risksBecameCritical === 1 ? "" : "s"} became critical`,
    );
  }
  if (decisionsBecameOverdue) {
    bullets.push(
      `${decisionsBecameOverdue} decision${decisionsBecameOverdue === 1 ? "" : "s"} became overdue`,
    );
  }
  if (!bullets.length) {
    bullets.push("No material portfolio movements detected this week");
  }

  return {
    healthPct: clamp(healthPct),
    rag,
    ragManual,
    steeringRag,
    areas,
    week: {
      projectsDeteriorated: deteriorated,
      projectsImproved: improved,
      forecastVarianceDelta,
      risksBecameCritical,
      decisionsBecameOverdue,
      bullets,
    },
    projectCount: engines.length,
    capturedAt: new Date(nowMs).toISOString(),
    comparedToAt: previous?.capturedAt ?? null,
    projectScores,
    forecastVariance,
  };
}

/** Build a persistable snapshot from a pulse result + supporting ids. */
export function toPulseSnapshot(opts: {
  orgId: string;
  pulse: PortfolioPulseResult;
  projectScores: Record<string, number>;
  forecastVariance: number;
  allRisks?: any[];
  allDecisions?: any[];
  nowMs?: number;
}): PulseSnapshot {
  const nowMs = opts.nowMs ?? Date.now();
  const areaScores = {} as Record<PulseAreaKey, number>;
  for (const a of opts.pulse.areas) areaScores[a.key] = a.score;
  return {
    orgId: opts.orgId,
    capturedAt: new Date(nowMs).toISOString(),
    healthPct: opts.pulse.healthPct,
    areaScores,
    projectScores: opts.projectScores,
    forecastVariance: opts.forecastVariance,
    criticalRiskIds: (opts.allRisks ?? [])
      .filter(isCriticalRisk)
      .map((r) => String(r.id))
      .filter(Boolean),
    overdueDecisionIds: (opts.allDecisions ?? [])
      .filter((d) => isOverdueDecision(d, nowMs))
      .map((d) => String(d.id))
      .filter(Boolean),
  };
}

/**
 * Update stored snapshot when prior is missing or older than ~6 days,
 * so "this week" comparisons stay meaningful without wiping same-day noise.
 */
export function maybeRefreshPulseSnapshot(
  snapshot: PulseSnapshot,
  nowMs = Date.now(),
  scope = "all",
): void {
  const prev = readPulseSnapshot(snapshot.orgId, scope);
  const age = prev?.capturedAt ? nowMs - new Date(prev.capturedAt).getTime() : Infinity;
  if (prev && age < 6 * 24 * 60 * 60 * 1000) return;
  writePulseSnapshot(snapshot, scope);
}

/** Convenience: evaluate pulse and return snapshot payload in one pass. */
export function evaluatePortfolioPulse(opts: {
  orgId: string;
  projects: PulseProjectInput[];
  allRisks?: any[];
  allDecisions?: any[];
  nowMs?: number;
  /** When filters are applied, scope week-over-week snapshots so deltas stay like-for-like. */
  snapshotScope?: string;
  fyStartMonth?: number | null;
}): { pulse: PortfolioPulseResult; snapshot: PulseSnapshot; snapshotScope: string } {
  const nowMs = opts.nowMs ?? Date.now();
  const snapshotScope = opts.snapshotScope || "all";
  const previous = readPulseSnapshot(opts.orgId, snapshotScope);
  const pulse = buildPortfolioPulse({ ...opts, previous, nowMs });
  const snapshot = toPulseSnapshot({
    orgId: opts.orgId,
    pulse,
    projectScores: pulse.projectScores,
    forecastVariance: pulse.forecastVariance,
    allRisks: opts.allRisks,
    allDecisions: opts.allDecisions,
    nowMs,
  });
  return { pulse, snapshot, snapshotScope };
}
