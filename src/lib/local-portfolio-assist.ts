/**
 * Local portfolio Q&A — no external LLM.
 * Interprets the user's wording, aggregates RLS-scoped rows already loaded
 * in the browser, and returns a plain-language answer. Org data never leaves
 * the session for model inference.
 */

export type AssistProject = {
  id: string;
  name?: string | null;
  status?: string | null;
  rag?: string | null;
  budget?: number | null;
  capex_incurred?: number | null;
  benefits_realised?: number | null;
};

export type AssistRisk = {
  title?: string | null;
  status?: string | null;
  severity?: number | null;
  owner?: string | null;
  project_id?: string | null;
};

export type AssistDecision = {
  title?: string | null;
  outcome?: string | null;
  status?: string | null;
  decision_date?: string | null;
  project_id?: string | null;
};

export type AssistAction = {
  title?: string | null;
  status?: string | null;
  due_date?: string | null;
  owner?: string | null;
  project_id?: string | null;
};

export type AssistBundle = {
  projects: AssistProject[];
  risks: AssistRisk[];
  decisions: AssistDecision[];
  actions?: AssistAction[];
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);

function pendingDecision(d: AssistDecision) {
  const o = String(d.outcome || d.status || "")
    .trim()
    .toLowerCase();
  return !o || o === "pending" || o === "in review" || o === "open";
}

function openRisk(r: AssistRisk) {
  const s = String(r.status || "");
  return s === "Open" || s === "Mitigating";
}

function overdueAction(a: AssistAction) {
  if (!a.due_date) return false;
  const s = String(a.status || "").toLowerCase();
  if (s === "done" || s === "closed" || s === "cancelled") return false;
  return new Date(a.due_date).getTime() < Date.now();
}

/** Match a project name mentioned in the question (simple contains). */
function mentionedProject(q: string, projects: AssistProject[]) {
  const lower = q.toLowerCase();
  return projects.find((p) => {
    const name = String(p.name || "").toLowerCase();
    return name.length >= 3 && lower.includes(name);
  });
}

type Intent =
  | "risks"
  | "decisions"
  | "budget"
  | "health"
  | "attention"
  | "actions"
  | "project"
  | "help"
  | "snapshot";

function detectIntent(q: string): Intent {
  const query = q.toLowerCase();
  if (/\b(help|what can you|how do i ask|examples?)\b/.test(query)) return "help";
  if (/\b(risk|severity|mitigat)/.test(query)) return "risks";
  if (/\b(approv|decision|governance board)\b/.test(query)) return "decisions";
  if (/\b(budget|spend|financ|capex|opex|cost)\b/.test(query)) return "budget";
  if (/\b(rag|health|status|amber|red projects?)\b/.test(query)) return "health";
  if (/\b(action|overdue|task|my work)\b/.test(query)) return "actions";
  if (/\b(week|attention|focus|priority|urgent|triage)\b/.test(query)) return "attention";
  return "snapshot";
}

export function answerPortfolioQuestion(raw: string, data: AssistBundle): string {
  const q = raw.trim();
  if (!q) return "Ask a question about your portfolio — for example risks, budget, or health.";

  const { projects, risks, decisions, actions = [] } = data;
  const red = projects.filter((p) => p.rag === "Red");
  const amber = projects.filter((p) => p.rag === "Amber");
  const budget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const openRisks = risks.filter(openRisk);
  const criticalRisks = risks.filter((r) => Number(r.severity || 0) >= 15);
  const pending = decisions.filter(pendingDecision);
  const overdue = actions.filter(overdueAction);

  const projectHit = mentionedProject(q, projects);
  if (projectHit) {
    const pid = projectHit.id;
    const pr = risks.filter((r) => r.project_id === pid && openRisk(r));
    const pd = decisions.filter(
      (d) => (d as { project_id?: string }).project_id === pid && pendingDecision(d),
    );
    return [
      `Project “${projectHit.name}” — RAG ${projectHit.rag || "—"}, status ${projectHit.status || "—"}.`,
      `Budget ${money(Number(projectHit.budget || 0))}; incurred CapEx ${money(Number(projectHit.capex_incurred || 0))}.`,
      `Open risks on this project: ${pr.length}${
        pr[0] ? ` (e.g. “${pr[0].title}”)` : ""
      }.`,
      `Pending/in-review decisions on this project: ${pd.length}.`,
      `All figures come from your org data in this session — nothing was sent to an external AI.`,
    ].join(" ");
  }

  switch (detectIntent(q)) {
    case "help":
      return [
        "I answer from live data already loaded for your organisation (RLS). No external AI.",
        "Try: “Summarise open risks”, “How is portfolio health?”, “Any decisions awaiting approval?”,",
        "“What’s our budget?”, “What needs attention this week?”, or name a project.",
      ].join(" ");

    case "risks": {
      const top = [...criticalRisks]
        .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
        .slice(0, 3)
        .map((r) => `“${r.title || "Untitled"}” (sev ${r.severity ?? "—"})`)
        .join("; ");
      return [
        `${openRisks.length} open/mitigating risks; ${criticalRisks.length} with severity ≥ 15.`,
        top ? `Highest: ${top}.` : "",
        `Focus mitigation on Red/Amber projects first (${red.length} Red, ${amber.length} Amber).`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "decisions":
      return [
        `${pending.length} decisions are Pending or In Review.`,
        pending[0] ? `Example: “${pending[0].title || "Untitled"}”.` : "",
        `Clear them via My Work → Approvals.`,
      ]
        .filter(Boolean)
        .join(" ");

    case "budget":
      return [
        `Portfolio budget across ${projects.length} projects is about ${money(budget)}.`,
        `Open Financials or FY Allocation for forecast vs actual by month.`,
      ].join(" ");

    case "health": {
      const names = red
        .slice(0, 4)
        .map((p) => p.name)
        .filter(Boolean)
        .join(", ");
      return [
        `Portfolio health: ${red.length} Red, ${amber.length} Amber, of ${projects.length} projects.`,
        names ? `Red projects include: ${names}.` : "",
        `Executive Dashboard has the full cockpit.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "actions":
      return [
        `${overdue.length} open actions are past due` +
          (actions.length ? ` (of ${actions.length} loaded).` : "."),
        overdue[0] ? `Example: “${overdue[0].title || "Untitled"}”.` : "",
        `See Actions or My Work for owners and dates.`,
      ]
        .filter(Boolean)
        .join(" ");

    case "attention":
      return [
        `This week: clear ${pending.length} pending decisions, review ${criticalRisks.length} critical risks,`,
        `and triage ${red.length} Red projects` +
          (overdue.length ? ` plus ${overdue.length} overdue actions` : "") +
          `.`,
      ].join(" ");

    default:
      return [
        `Live snapshot — Projects: ${projects.length} · Red: ${red.length} · Amber: ${amber.length}`,
        `· Open risks: ${openRisks.length} · Decisions awaiting outcome: ${pending.length}.`,
        `Ask about risks, approvals, budget, health, actions, or a project name.`,
        `(Local assist — your data stays in this browser session under RLS.)`,
      ].join(" ");
  }
}
