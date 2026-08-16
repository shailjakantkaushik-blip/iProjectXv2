/**
 * Ranked steering-pack items for the Executive Dashboard Quick view.
 * Uses the health engine plus RAID / gates / decisions already in the org.
 */
import { displayRag } from "@/lib/ops-enhancements";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import { isGateScheduleDelayed } from "@/lib/finance-lifecycle";
import { isDecisionAwaiting } from "@/lib/decision-approval";
import {
  evaluateProjectHealth,
  type HealthEngineResult,
  type RagTone,
} from "@/lib/project-health-engine";
import type { EvmMonthlyLike } from "@/lib/evm";

export type BriefingProject = ProjectFinanceLike & {
  id: string;
  project_code?: string | null;
  name?: string | null;
  status?: string | null;
  rag?: string | null;
  rag_override?: string | null;
  program?: string | null;
  sponsor?: string | null;
  priority?: string | null;
  portfolio?: string | null;
  end_date?: string | null;
  planned_end_date?: string | null;
  start_date?: string | null;
  planned_start_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
};

export type BriefingGate = {
  id?: string;
  project_id: string;
  gate_name?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status?: string | null;
};

export type BriefingRisk = {
  id: string;
  project_id: string;
  title?: string | null;
  status?: string | null;
  severity?: number | null;
  probability?: number | null;
  impact?: number | null;
  owner?: string | null;
};

export type BriefingDecision = {
  id: string;
  project_id: string;
  title?: string | null;
  outcome?: string | null;
  status?: string | null;
  required_date?: string | null;
  recommendation?: string | null;
};

export type BriefingAction = {
  id: string;
  severity: RagTone;
  kind: "decision" | "money" | "schedule" | "risk" | "health";
  title: string;
  projectId: string;
  projectLabel: string;
  why: string;
  ask: string;
  amount?: number;
  rank: number;
};

export type ProjectWatchRow = {
  project: BriefingProject;
  rag: string;
  engine: HealthEngineResult;
  budget: number;
  incurred: number;
  fac: number;
  overrun: number;
  isOverdue: boolean;
  lateGates: number;
  topWhy: string;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function labelOf(p: BriefingProject) {
  return p.project_code ? `${p.project_code} · ${p.name || "Project"}` : String(p.name || p.id);
}

function isOpenRisk(r: BriefingRisk) {
  const s = String(r.status || "").toLowerCase();
  return !/closed|mitigated|accepted|resolved/.test(s);
}

function isCriticalRisk(r: BriefingRisk) {
  if (num(r.severity) >= 12) return true;
  return num(r.probability) * num(r.impact) >= 12;
}

export function projectOverrun(p: BriefingProject) {
  const budget = projectApprovedFunding(p);
  const fac = projectForecast(p);
  return { budget, fac, incurred: projectIncurred(p), overrun: fac - budget };
}

export function buildExecutiveBriefing(opts: {
  projects: BriefingProject[];
  gates: BriefingGate[];
  monthly: EvmMonthlyLike[];
  risks: BriefingRisk[];
  decisions: BriefingDecision[];
  now?: Date;
}): {
  overallRag: RagTone;
  headline: string;
  moneyAtRisk: number;
  lateGateCount: number;
  decisionsWaiting: number;
  criticalRisks: number;
  overdueCount: number;
  actions: BriefingAction[];
  watch: ProjectWatchRow[];
  healthByProject: Map<string, HealthEngineResult>;
} {
  const now = opts.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const ids = new Set(opts.projects.map((p) => p.id));
  const byId = new Map(opts.projects.map((p) => [p.id, p]));

  const gates = opts.gates.filter((g) => ids.has(g.project_id));
  const risks = opts.risks.filter((r) => ids.has(r.project_id) && isOpenRisk(r));
  const decisions = opts.decisions.filter((d) => ids.has(d.project_id) && isDecisionAwaiting(d));

  const healthByProject = new Map<string, HealthEngineResult>();
  const watch: ProjectWatchRow[] = [];
  const actions: BriefingAction[] = [];

  for (const p of opts.projects) {
    const pg = gates.filter((g) => g.project_id === p.id);
    const pr = risks.filter((r) => r.project_id === p.id);
    const pm = opts.monthly.filter((m) => m.project_id === p.id);
    const engine = evaluateProjectHealth({
      project: p,
      gates: pg,
      risks: pr,
      monthly: pm,
    });
    healthByProject.set(p.id, engine);
    const money = projectOverrun(p);
    const lateGates = pg.filter((g) => isGateScheduleDelayed(g, now)).length;
    const end = p.actual_end_date || p.planned_end_date || p.end_date;
    const isOverdue = !!(end && end < todayIso && p.status !== "Completed");
    const rag = displayRag(p) || engine.rag;
    const topDriver = engine.drivers.find((d) => d.severity === "Red") || engine.drivers[0];
    const topWarn = engine.earlyWarnings[0];
    const topWhy =
      topWarn?.title ||
      topDriver?.message ||
      (isOverdue ? "Past planned end without completion" : engine.forecast.message);

    watch.push({
      project: p,
      rag,
      engine,
      budget: money.budget,
      incurred: money.incurred,
      fac: money.fac,
      overrun: money.overrun,
      isOverdue,
      lateGates,
      topWhy,
    });

    if (money.overrun > money.budget * 0.02 && money.overrun > 10000) {
      actions.push({
        id: `money-${p.id}`,
        severity: money.overrun > money.budget * 0.05 ? "Red" : "Amber",
        kind: "money",
        title: `${labelOf(p)} forecast is over envelope`,
        projectId: p.id,
        projectLabel: labelOf(p),
        why: `FAC ${Math.round(money.fac).toLocaleString()} vs budget ${Math.round(money.budget).toLocaleString()}.`,
        ask: "Confirm the uplift path or pull scope back to the envelope.",
        amount: money.overrun,
        rank: 80 + Math.min(20, (money.overrun / Math.max(money.budget, 1)) * 100),
      });
    }

    if (engine.rag === "Red" || (rag === "Red" && engine.earlyWarnings.length)) {
      actions.push({
        id: `health-${p.id}`,
        severity: "Red",
        kind: "health",
        title: `${labelOf(p)} is off-track`,
        projectId: p.id,
        projectLabel: labelOf(p),
        why: topWhy,
        ask: topWarn?.recommendedAction || "Steer this week — do not wait for the next pack.",
        rank: 90,
      });
    }
  }

  for (const g of gates.filter((g) => isGateScheduleDelayed(g, now))) {
    const p = byId.get(g.project_id);
    if (!p) continue;
    actions.push({
      id: `gate-${g.id || g.gate_name}-${g.project_id}`,
      severity: "Red",
      kind: "schedule",
      title: `${g.gate_name || "Stage gate"} is late`,
      projectId: p.id,
      projectLabel: labelOf(p),
      why: `Planned ${String(g.planned_date || "").slice(0, 10) || "—"} · still ${g.status || "open"}.`,
      ask: "Approve, rebaseline the date, or stop the lane until the pack is ready.",
      rank: 85,
    });
  }

  for (const r of risks.filter(isCriticalRisk)) {
    const p = byId.get(r.project_id);
    if (!p) continue;
    actions.push({
      id: `risk-${r.id}`,
      severity: "Red",
      kind: "risk",
      title: r.title || "Critical risk open",
      projectId: p.id,
      projectLabel: labelOf(p),
      why: `Severity ${r.severity ?? "—"} · owner ${r.owner || "unassigned"}.`,
      ask: "Accept, fund mitigation, or escalate today.",
      rank: 88,
    });
  }

  for (const d of decisions) {
    const p = byId.get(d.project_id);
    if (!p) continue;
    const due = String(d.required_date || "").slice(0, 10);
    const overdue = !!(due && due < todayIso);
    actions.push({
      id: `decision-${d.id}`,
      severity: overdue ? "Red" : "Amber",
      kind: "decision",
      title: d.title || "Decision waiting",
      projectId: p.id,
      projectLabel: labelOf(p),
      why: due ? `Required ${due}${overdue ? " — overdue" : ""}.` : "No required date set.",
      ask: d.recommendation?.trim() || "Approve, reject, or send back with a date.",
      rank: overdue ? 120 : 100,
    });
  }

  actions.sort((a, b) => b.rank - a.rank || (b.amount || 0) - (a.amount || 0));
  const seen = new Set<string>();
  const unique: BriefingAction[] = [];
  for (const a of actions) {
    const key = `${a.kind}:${a.projectId}:${a.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
    if (unique.length >= 5) break;
  }

  watch.sort((a, b) => {
    const ragW = (r: string) => (r === "Red" ? 0 : r === "Amber" ? 1 : 2);
    const ar = ragW(a.rag);
    const br = ragW(b.rag);
    if (ar !== br) return ar - br;
    if (a.engine.score !== b.engine.score) return a.engine.score - b.engine.score;
    return b.overrun - a.overrun;
  });

  const redN = watch.filter((w) => w.rag === "Red").length;
  const amberN = watch.filter((w) => w.rag === "Amber").length;
  const overallRag: RagTone = redN > 0 ? "Red" : amberN > 0 ? "Amber" : "Green";
  const moneyAtRisk = watch.reduce((s, w) => s + Math.max(0, w.overrun), 0);
  const lateGateCount = gates.filter((g) => isGateScheduleDelayed(g, now)).length;
  const overdueCount = watch.filter((w) => w.isOverdue).length;
  const criticalRisks = risks.filter(isCriticalRisk).length;
  const decisionsWaiting = decisions.length;

  const bits: string[] = [];
  if (decisionsWaiting)
    bits.push(`${decisionsWaiting} decision${decisionsWaiting === 1 ? "" : "s"} waiting on you`);
  if (moneyAtRisk > 0) bits.push(`${money(moneyAtRisk)} forecast above envelope`);
  if (lateGateCount) bits.push(`${lateGateCount} late gate${lateGateCount === 1 ? "" : "s"}`);
  if (criticalRisks)
    bits.push(`${criticalRisks} critical risk${criticalRisks === 1 ? "" : "s"} still open`);
  if (overdueCount)
    bits.push(`${overdueCount} project${overdueCount === 1 ? "" : "s"} past planned end`);

  const headline =
    opts.projects.length === 0
      ? "No projects in this filter."
      : bits.length
        ? bits.join(" · ") + "."
        : `Portfolio is steady — ${watch.length} project${watch.length === 1 ? "" : "s"}, none flagged.`;

  return {
    overallRag,
    headline,
    moneyAtRisk,
    lateGateCount,
    decisionsWaiting,
    criticalRisks,
    overdueCount,
    actions: unique,
    watch: watch
      .filter((w) => w.rag === "Red" || w.rag === "Amber" || w.isOverdue || w.overrun > 0)
      .slice(0, 6),
    healthByProject,
  };
}

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}
