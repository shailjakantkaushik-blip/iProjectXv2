/**
 * In-house AI — local portfolio Q&A with no external LLM.
 * Interprets the user's wording, aggregates RLS-scoped rows already loaded
 * in the browser, and returns a plain-language answer. Org data never leaves
 * the session for model inference.
 */

export type AssistProject = {
  id: string
  name?: string | null
  status?: string | null
  rag?: string | null
  budget?: number | null
  capex_incurred?: number | null
  benefits_realised?: number | null
}

export type AssistRisk = {
  title?: string | null
  status?: string | null
  severity?: number | null
  owner?: string | null
  project_id?: string | null
}

export type AssistDecision = {
  title?: string | null
  outcome?: string | null
  status?: string | null
  decision_date?: string | null
  project_id?: string | null
}

export type AssistAction = {
  title?: string | null
  status?: string | null
  due_date?: string | null
  owner?: string | null
  project_id?: string | null
}

export type AssistBundle = {
  projects: AssistProject[]
  risks: AssistRisk[]
  decisions: AssistDecision[]
  actions?: AssistAction[]
}

export type AssistIntent =
  | "risks"
  | "decisions"
  | "budget"
  | "health"
  | "attention"
  | "actions"
  | "project"
  | "help"
  | "snapshot"

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0)

function pendingDecision(d: AssistDecision) {
  const o = String(d.outcome || d.status || "")
    .trim()
    .toLowerCase()
  return !o || o === "pending" || o === "in review" || o === "open"
}

function openRisk(r: AssistRisk) {
  const s = String(r.status || "")
  return s === "Open" || s === "Mitigating"
}

function overdueAction(a: AssistAction) {
  if (!a.due_date) return false
  const s = String(a.status || "").toLowerCase()
  if (s === "done" || s === "closed" || s === "cancelled") return false
  return new Date(a.due_date).getTime() < Date.now()
}

const PROJECT_STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "about",
  "open",
  "show",
  "list",
  "what",
  "how",
  "are",
  "our",
  "this",
  "that",
  "any",
  "needs",
  "need",
  "week",
  "project",
  "projects",
  "portfolio",
  "summarise",
  "summarize",
  "summary",
  "tell",
  "please",
  "assist",
  "help",
  "risk",
  "risks",
  "decision",
  "decisions",
  "approval",
  "approvals",
  "budget",
  "health",
  "action",
  "actions",
  "status",
  "awaiting",
  "outcome",
  "outcomes",
  "attention",
  "focus",
])

/** Match a project name mentioned in the question (prefer longer, skip stop-words). */
export function mentionedProject(q: string, projects: AssistProject[]): AssistProject | null {
  const lower = q.toLowerCase()
  let best: AssistProject | null = null
  let bestLen = 0

  for (const p of projects) {
    const name = String(p.name || "")
      .toLowerCase()
      .trim()
    if (name.length < 3) continue
    if (PROJECT_STOP.has(name)) continue
    if (!lower.includes(name)) continue
    const boundary = new RegExp(
      `(?:^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`,
      "i",
    )
    // Require a token boundary for short names to avoid accidental substrings
    if (!boundary.test(lower) && name.length < 8) continue
    if (name.length > bestLen) {
      best = p
      bestLen = name.length
    }
  }
  return best
}

type ScoredIntent = Exclude<AssistIntent, "project" | "help" | "snapshot">

const INTENT_PATTERNS: Record<ScoredIntent, RegExp[]> = {
  risks: [/\brisks?\b/i, /\bseverity\b/i, /\bmitigat(?:e|ion|ing)?\b/i, /\bissues?\b/i],
  decisions: [
    /\bdecisions?\b/i,
    /\bapprovals?\b/i,
    /\bapprov(?:e|ed|al|als|ing)?\b/i,
    /\bgovernance\b/i,
    /\bawaiting\b/i,
  ],
  budget: [/\bbudgets?\b/i, /\bspend(?:ing)?\b/i, /\bfinanc(?:e|ial|ials)?\b/i, /\bcapex\b/i, /\bopex\b/i, /\bcosts?\b/i],
  health: [/\bhealth\b/i, /\brag\b/i, /\bamber\b/i, /\bred projects?\b/i, /\bgreen projects?\b/i],
  actions: [/\bactions?\b/i, /\boverdue\b/i, /\btasks?\b/i, /\bmy work\b/i, /\btodos?\b/i],
  attention: [
    /\battention\b/i,
    /\bthis week\b/i,
    /\bfocus\b/i,
    /\bpriorit(?:y|ies)\b/i,
    /\burgent\b/i,
    /\btriage\b/i,
    /\bneeds attention\b/i,
  ],
}

function scoreIntent(q: string, intent: ScoredIntent): number {
  let score = 0
  for (const re of INTENT_PATTERNS[intent]) {
    if (re.test(q)) score += 2
  }
  return score
}

export function detectIntent(q: string): AssistIntent {
  const query = q.toLowerCase().trim()
  if (!query) return "help"
  if (/\b(help|what can you|how do i ask|examples?)\b/.test(query)) return "help"

  const scores = (Object.keys(INTENT_PATTERNS) as ScoredIntent[]).map((intent) => ({
    intent,
    score: scoreIntent(query, intent),
  }))
  scores.sort((a, b) => b.score - a.score)

  const top = scores[0]
  const second = scores[1]
  if (top && top.score >= 2) {
    if (!second || top.score > second.score) return top.intent
    // Tie-break: operational intents over broad “attention”
    const order: ScoredIntent[] = ["risks", "decisions", "actions", "budget", "health", "attention"]
    const tied = scores.filter((s) => s.score === top.score).map((s) => s.intent)
    tied.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return tied[0] ?? "snapshot"
  }

  if (/\b(overview|summary|summarise|summarize|snapshot|dashboard)\b/.test(query)) {
    return "snapshot"
  }

  return "snapshot"
}

function answerProject(projectHit: AssistProject, data: AssistBundle): string {
  const { risks, decisions } = data
  const pid = projectHit.id
  const pr = risks.filter((r) => r.project_id === pid && openRisk(r))
  const pd = decisions.filter((d) => d.project_id === pid && pendingDecision(d))
  return [
    `Project “${projectHit.name}” — RAG ${projectHit.rag || "—"}, status ${projectHit.status || "—"}.`,
    `Budget ${money(Number(projectHit.budget || 0))}; incurred CapEx ${money(Number(projectHit.capex_incurred || 0))}.`,
    `Open risks on this project: ${pr.length}${pr[0] ? ` (e.g. “${pr[0].title}”)` : ""}.`,
    `Pending/in-review decisions on this project: ${pd.length}.`,
    `All figures come from your org data in this session — nothing was sent to an external AI.`,
  ].join(" ")
}

export function answerPortfolioQuestion(raw: string, data: AssistBundle): string {
  const q = raw.trim()
  if (!q) return "Ask a question about your portfolio — for example risks, budget, or health."

  const { projects, risks, decisions, actions = [] } = data
  const red = projects.filter((p) => p.rag === "Red")
  const amber = projects.filter((p) => p.rag === "Amber")
  const budget = projects.reduce((s, p) => s + Number(p.budget || 0), 0)
  const openRisks = risks.filter(openRisk)
  const criticalRisks = risks.filter((r) => Number(r.severity || 0) >= 15)
  const pending = decisions.filter(pendingDecision)
  const overdue = actions.filter(overdueAction)

  const intent = detectIntent(q)
  const projectHit = mentionedProject(q, projects)

  // Only answer as a project brief when intent is unclear / snapshot
  if (projectHit && (intent === "snapshot" || intent === "help")) {
    return answerProject(projectHit, data)
  }

  switch (intent) {
    case "help":
      return [
        "I’m In-house AI — I answer from live data already loaded for your organisation (RLS). No external AI.",
        "Try: “Summarise open risks”, “How is portfolio health?”, “Any decisions awaiting approval?”,",
        "“What’s our budget?”, “What needs attention this week?”, or name a project.",
      ].join(" ")

    case "risks": {
      const top = [...criticalRisks]
        .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
        .slice(0, 3)
        .map((r) => `“${r.title || "Untitled"}” (sev ${r.severity ?? "—"})`)
        .join("; ")
      return [
        `${openRisks.length} open/mitigating risks; ${criticalRisks.length} with severity ≥ 15.`,
        top ? `Highest: ${top}.` : "",
        `Focus mitigation on Red/Amber projects first (${red.length} Red, ${amber.length} Amber).`,
      ]
        .filter(Boolean)
        .join(" ")
    }

    case "decisions":
      return [
        `${pending.length} decisions are Pending or In Review.`,
        pending[0] ? `Example: “${pending[0].title || "Untitled"}”.` : "",
        `Clear them via My Work → Approvals.`,
      ]
        .filter(Boolean)
        .join(" ")

    case "budget":
      return [
        `Portfolio budget across ${projects.length} projects is about ${money(budget)}.`,
        `Open Financials or FY Allocation for forecast vs actual by month.`,
      ].join(" ")

    case "health": {
      const names = red
        .slice(0, 4)
        .map((p) => p.name)
        .filter(Boolean)
        .join(", ")
      return [
        `Portfolio health: ${red.length} Red, ${amber.length} Amber, of ${projects.length} projects.`,
        names ? `Red projects include: ${names}.` : "",
        `Executive Dashboard has the full cockpit.`,
      ]
        .filter(Boolean)
        .join(" ")
    }

    case "actions":
      return [
        `${overdue.length} open actions are past due` +
          (actions.length ? ` (of ${actions.length} loaded).` : "."),
        overdue[0] ? `Example: “${overdue[0].title || "Untitled"}”.` : "",
        `See Actions or My Work for owners and dates.`,
      ]
        .filter(Boolean)
        .join(" ")

    case "attention":
      return [
        `This week: clear ${pending.length} pending decisions, review ${criticalRisks.length} critical risks,`,
        `and triage ${red.length} Red projects` +
          (overdue.length ? ` plus ${overdue.length} overdue actions` : "") +
          `.`,
      ].join(" ")

    case "project":
      return projectHit
        ? answerProject(projectHit, data)
        : [
            `Live snapshot — Projects: ${projects.length} · Red: ${red.length} · Amber: ${amber.length}`,
            `· Open risks: ${openRisks.length} · Decisions awaiting outcome: ${pending.length}.`,
            `Ask about risks, approvals, budget, health, actions, or a project name.`,
            `(In-house AI — your data stays in this browser session under RLS.)`,
          ].join(" ")

    default:
      return [
        `Live snapshot — Projects: ${projects.length} · Red: ${red.length} · Amber: ${amber.length}`,
        `· Open risks: ${openRisks.length} · Decisions awaiting outcome: ${pending.length}.`,
        `Ask about risks, approvals, budget, health, actions, or a project name.`,
        `(In-house AI — your data stays in this browser session under RLS.)`,
      ].join(" ")
  }
}
