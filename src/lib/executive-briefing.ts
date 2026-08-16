/**
 * Ranked steering-pack items for the Executive Dashboard Quick view.
 * Uses the health engine plus RAID / gates / decisions already in the org.
 */
import { effectiveRag, isRagOverridden, worstRagOf } from "@/lib/ops-enhancements";
import {
  projectApprovedFunding,
  projectForecast,
  projectIncurred,
  type ProjectFinanceLike,
} from "@/lib/project-finance";
import { isGateScheduleDelayed } from "@/lib/finance-lifecycle";
import { decisionOutcome, isDecisionAwaiting } from "@/lib/decision-approval";
import {
  evaluateProjectHealth,
  scoreToRag,
  type HealthEngineInput,
  type HealthEngineResult,
  type RagTone,
} from "@/lib/project-health-engine";
import type { EvmMonthlyLike } from "@/lib/evm";
import type { MetricExplanation } from "@/lib/explain-metric";
import { raidLabel } from "@/lib/raid-code";

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
  raid_code?: string | null;
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
  raid_code?: string | null;
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
  /** Steering RAG — register, or rag_override when set. */
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

export type BriefingQuestionExplains = {
  decisions: MetricExplanation;
  money: MetricExplanation;
  time: MetricExplanation;
  risk: MetricExplanation;
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
  workItems?: HealthEngineInput["workItems"];
  dependencies?: HealthEngineInput["dependencies"];
  allocations?: HealthEngineInput["allocations"];
  changeRequests?: HealthEngineInput["changeRequests"];
  now?: Date;
}): {
  overallRag: RagTone;
  /** Average Health Engine score → RAG bands (before sponsor override). */
  calculatedRag: RagTone;
  healthPct: number;
  /** Worst effective RAG (override wins) across the filter. Same as overallRag. */
  steeringRag: RagTone;
  /** True when any in-scope project has rag_override set. */
  ragManual: boolean;
  headline: string;
  moneyAtRisk: number;
  lateGateCount: number;
  decisionsWaiting: number;
  criticalRisks: number;
  overdueCount: number;
  actions: BriefingAction[];
  watch: ProjectWatchRow[];
  healthByProject: Map<string, HealthEngineResult>;
  questionExplains: BriefingQuestionExplains;
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
      workItems: (opts.workItems ?? []).filter((w) => w.project_id === p.id),
      dependencies: (opts.dependencies ?? []).filter(
        (d) => (d as { project_id?: string }).project_id === p.id,
      ),
      allocations: (opts.allocations ?? []).filter(
        (a) => (a as { project_id?: string }).project_id === p.id,
      ),
      changeRequests: (opts.changeRequests ?? []).filter(
        (c) => (c as { project_id?: string }).project_id === p.id,
      ),
    });
    healthByProject.set(p.id, engine);
    const money = projectOverrun(p);
    const lateGates = pg.filter((g) => isGateScheduleDelayed(g, now)).length;
    const end = p.actual_end_date || p.planned_end_date || p.end_date;
    const isOverdue = !!(end && end < todayIso && p.status !== "Completed");
    const rag = effectiveRag(p, engine.rag) || engine.rag;
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
      title: raidLabel(r, "Critical risk open"),
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
      title: raidLabel(d, "Decision waiting"),
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
    const ar = Math.min(ragW(a.rag), ragW(a.engine.rag));
    const br = Math.min(ragW(b.rag), ragW(b.engine.rag));
    if (ar !== br) return ar - br;
    if (a.engine.score !== b.engine.score) return a.engine.score - b.engine.score;
    return b.overrun - a.overrun;
  });

  const healthPct = healthByProject.size
    ? Math.round(
        [...healthByProject.values()].reduce((s, e) => s + e.score, 0) / healthByProject.size,
      )
    : 0;
  const calculatedRag: RagTone = opts.projects.length ? scoreToRag(healthPct) : "Green";
  const ragManual = opts.projects.some((p) => isRagOverridden(p));
  const overallRag: RagTone = opts.projects.length
    ? worstRagOf(opts.projects.map((p) => effectiveRag(p, healthByProject.get(p.id)?.rag)))
    : "Green";
  const steeringRag: RagTone = overallRag;
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

  const envelope = watch.reduce((s, w) => s + w.budget, 0);
  const facTotal = watch.reduce((s, w) => s + w.fac, 0);
  const incurredTotal = watch.reduce((s, w) => s + w.incurred, 0);
  const remaining = Math.max(0, envelope - incurredTotal);
  const overBudgetRows = [...watch]
    .filter((w) => w.overrun > 0)
    .sort((a, b) => b.overrun - a.overrun);
  const overdueRows = watch.filter((w) => w.isOverdue);
  const lateGateRows = gates.filter((g) => isGateScheduleDelayed(g, now));
  const criticalRows = risks.filter(isCriticalRisk);

  const questionExplains: BriefingQuestionExplains = {
    decisions: explainWhy({
      title: "Do you need to decide?",
      headline: decisionsWaiting
        ? `${decisionsWaiting} decision${decisionsWaiting === 1 ? "" : "s"} still waiting on steering.`
        : "Nothing is waiting on a steering decision in this filter.",
      bullets: [
        "Counts RAID decisions whose outcome is Pending or In Review. Approved, Rejected, and On Hold are excluded.",
        ...namedLines(
          decisions.map((d) => {
            const p = byId.get(d.project_id);
            const due = String(d.required_date || "").slice(0, 10);
            const overdue = !!(due && due < todayIso);
            const dueBit = due
              ? `required ${due}${overdue ? " (overdue)" : ""}`
              : "no required date";
            return `${raidLabel(d, "Untitled decision")} — ${p ? labelOf(p) : "Unknown project"} · ${decisionOutcome(d)} · ${dueBit}.`;
          }),
        ),
        ...(decisionsWaiting
          ? []
          : [
              "If a decision should appear here, check it is not On Hold and that its project is in this filter.",
            ]),
      ],
    }),
    money: explainWhy({
      title: "Is the money still inside the envelope?",
      headline:
        moneyAtRisk > 0
          ? `FAC ${money(facTotal)} is ${money(moneyAtRisk)} above the ${money(envelope)} envelope.`
          : `FAC ${money(facTotal)} is inside the ${money(envelope)} envelope.`,
      bullets: [
        `Envelope is approved funding (Budget) on the ${watch.length} project${watch.length === 1 ? "" : "s"} in this filter.`,
        `Incurred-to-date is ${money(incurredTotal)}, so ${money(remaining)} remains against the envelope.`,
        moneyAtRisk > 0
          ? "The card’s “above budget” figure is the sum of projects whose Forecast at Completion is above their own envelope — not remaining unspent."
          : "No project Forecast at Completion is above its own approved envelope.",
        ...namedLines(
          overBudgetRows.map(
            (w) =>
              `${labelOf(w.project)}: FAC ${money(w.fac)} vs budget ${money(w.budget)} (${money(w.overrun)} over).`,
          ),
        ),
      ],
    }),
    time: explainWhy({
      title: "Are we on time?",
      headline:
        lateGateCount + overdueCount === 0
          ? "No late gates and no projects past planned end."
          : `${lateGateCount} late gate${lateGateCount === 1 ? "" : "s"} and ${overdueCount} project${overdueCount === 1 ? "" : "s"} past planned end.`,
      bullets: [
        "The number on the card is late gates plus overdue projects. A project can contribute to both.",
        "A gate is late when its planned date has passed with no actual, or the actual is after the plan, and the gate is not completed.",
        "A project is overdue when planned or actual end is before today and status is not Completed.",
        ...(lateGateRows.length
          ? [
              `Late gates (${lateGateRows.length}):`,
              ...namedLines(
                lateGateRows.map((g) => {
                  const p = byId.get(g.project_id);
                  const planned = String(g.planned_date || "").slice(0, 10) || "no planned date";
                  return `${g.gate_name || "Stage gate"} on ${p ? labelOf(p) : "Unknown"} — planned ${planned}, still ${g.status || "open"}.`;
                }),
              ),
            ]
          : []),
        ...(overdueRows.length
          ? [
              `Overdue projects (${overdueRows.length}):`,
              ...namedLines(
                overdueRows.map((w) => {
                  const end =
                    w.project.actual_end_date || w.project.planned_end_date || w.project.end_date;
                  return `${labelOf(w.project)} — planned end ${String(end || "").slice(0, 10) || "—"}, still ${w.project.status || "open"}.`;
                }),
              ),
            ]
          : []),
      ],
    }),
    risk: explainWhy({
      title: "What could still hurt us?",
      headline: criticalRisks
        ? `${criticalRisks} open critical risk${criticalRisks === 1 ? "" : "s"} (score 12 or higher).`
        : "No open risks score 12 or higher.",
      bullets: [
        "Critical means severity ≥ 12, or probability × impact ≥ 12. Closed, mitigated, accepted, and resolved risks are excluded.",
        ...namedLines(
          criticalRows.map((r) => {
            const p = byId.get(r.project_id);
            const score =
              num(r.severity) >= 12 ? num(r.severity) : num(r.probability) * num(r.impact);
            return `${raidLabel(r, "Untitled risk")} — ${p ? labelOf(p) : "Unknown"} · score ${score || "—"} · owner ${r.owner || "unassigned"}.`;
          }),
        ),
        ...(criticalRisks
          ? []
          : [
              "Lower-scoring open risks still sit on the project RAID log; they are not on this card.",
            ]),
      ],
    }),
  };

  return {
    overallRag,
    calculatedRag,
    healthPct,
    steeringRag,
    ragManual,
    headline,
    moneyAtRisk,
    lateGateCount,
    decisionsWaiting,
    criticalRisks,
    overdueCount,
    actions: unique,
    watch: watch
      .filter(
        (w) =>
          w.rag === "Red" ||
          w.rag === "Amber" ||
          w.engine.rag === "Red" ||
          w.engine.rag === "Amber" ||
          w.isOverdue ||
          w.overrun > 0,
      )
      .slice(0, 6),
    healthByProject,
    questionExplains,
  };
}

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function namedLines(lines: string[], cap = 8) {
  if (!lines.length) return [];
  if (lines.length <= cap) return lines;
  return [...lines.slice(0, cap), `…and ${lines.length - cap} more.`];
}

function explainWhy(opts: {
  title: string;
  headline: string;
  bullets: string[];
}): MetricExplanation {
  const bullets = opts.bullets.length ? opts.bullets : ["Nothing in this filter matches."];
  return {
    title: opts.title,
    headline: opts.headline,
    bullets,
    drivers: bullets.map((b) => ({ label: b })),
    confidence: "high",
  };
}
