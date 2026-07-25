/**
 * In-house AI — natural-language portfolio Q&A with no external LLM.
 *
 * Parses plain English into a structured query over RLS-scoped rows already
 * loaded in the browser, then answers with concrete names, owners, amounts,
 * and statuses. Org data never leaves the session for model inference.
 */

export type AssistProject = {
  id: string
  org_id?: string | null
  name?: string | null
  project_code?: string | null
  status?: string | null
  rag?: string | null
  budget?: number | null
  capex_approved?: number | null
  capex_incurred?: number | null
  opex_approved?: number | null
  opex_incurred?: number | null
  benefits_realised?: number | null
  benefits_target?: number | null
  current_phase?: string | null
  sponsor?: string | null
  priority?: string | null
  portfolio?: string | null
  program?: string | null
  start_date?: string | null
  end_date?: string | null
  planned_end_date?: string | null
  target_go_live?: string | null
}

export type AssistRisk = {
  id?: string
  title?: string | null
  description?: string | null
  status?: string | null
  severity?: number | null
  owner?: string | null
  project_id?: string | null
  mitigation?: string | null
  category?: string | null
  due_date?: string | null
}

export type AssistDecision = {
  id?: string
  title?: string | null
  description?: string | null
  outcome?: string | null
  status?: string | null
  decision_date?: string | null
  project_id?: string | null
  sponsor?: string | null
  decided_by?: string | null
  forum?: string | null
}

export type AssistAction = {
  id?: string
  title?: string | null
  description?: string | null
  status?: string | null
  due_date?: string | null
  owner?: string | null
  project_id?: string | null
  priority?: string | null
}

export type AssistBundle = {
  projects: AssistProject[]
  risks: AssistRisk[]
  decisions: AssistDecision[]
  actions?: AssistAction[]
}

export type AssistTopic =
  | "risks"
  | "decisions"
  | "budget"
  | "health"
  | "actions"
  | "benefits"
  | "projects"
  | "attention"
  | "overview"
  | "help"
  | "greeting"

export type ParsedAssistQuery = {
  topics: AssistTopic[]
  project: AssistProject | null
  projects: AssistProject[]
  rag: "Red" | "Amber" | "Green" | null
  criticalOnly: boolean
  overdueOnly: boolean
  listMode: boolean
  countMode: boolean
  whoMode: boolean
  topMode: boolean
  compareMode: boolean
  matchedRisk: AssistRisk | null
  matchedDecision: AssistDecision | null
  matchedAction: AssistAction | null
  raw: string
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0)

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
  "which",
  "where",
  "when",
  "who",
  "why",
  "many",
  "much",
  "most",
  "least",
  "highest",
  "lowest",
  "biggest",
  "smallest",
  "overdue",
  "critical",
  "amber",
  "green",
  "red",
])

function pendingDecision(d: AssistDecision) {
  const o = String(d.outcome || d.status || "")
    .trim()
    .toLowerCase()
  return !o || o === "pending" || o === "in review" || o === "open" || o === "proposed"
}

function openRisk(r: AssistRisk) {
  const s = String(r.status || "").toLowerCase()
  return s === "open" || s === "mitigating"
}

function openAction(a: AssistAction) {
  const s = String(a.status || "").toLowerCase()
  return s !== "done" && s !== "closed" && s !== "cancelled" && s !== "complete" && s !== "completed"
}

function overdueAction(a: AssistAction) {
  if (!a.due_date || !openAction(a)) return false
  return new Date(a.due_date).getTime() < Date.now()
}

function projectName(p: AssistProject | null | undefined): string {
  if (!p) return "Unknown project"
  const code = p.project_code ? ` (${p.project_code})` : ""
  return `${p.name || "Untitled"}${code}`
}

function projectById(projects: AssistProject[], id?: string | null) {
  if (!id) return null
  return projects.find((p) => p.id === id) || null
}

function normalize(q: string) {
  return q
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s./$-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Match project names / codes mentioned in the question. */
export function mentionedProjects(q: string, projects: AssistProject[]): AssistProject[] {
  const lower = normalize(q)
  const hits: Array<{ p: AssistProject; len: number }> = []

  for (const p of projects) {
    const candidates = [p.name, p.project_code].filter(Boolean) as string[]
    for (const raw of candidates) {
      const needle = raw.toLowerCase().trim()
      if (needle.length < 3 || PROJECT_STOP.has(needle)) continue
      if (!lower.includes(needle)) continue
      const boundary = new RegExp(
        `(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`,
        "i",
      )
      if (!boundary.test(lower) && needle.length < 8) continue
      hits.push({ p, len: needle.length })
    }
  }

  hits.sort((a, b) => b.len - a.len)
  const seen = new Set<string>()
  const out: AssistProject[] = []
  for (const h of hits) {
    if (seen.has(h.p.id)) continue
    seen.add(h.p.id)
    out.push(h.p)
  }
  return out
}

export function mentionedProject(q: string, projects: AssistProject[]): AssistProject | null {
  return mentionedProjects(q, projects)[0] ?? null
}

function matchByTitle<T extends { title?: string | null }>(
  q: string,
  rows: T[],
  minLen = 8,
): T | null {
  const lower = normalize(q)
  let best: T | null = null
  let bestLen = 0
  for (const row of rows) {
    const title = String(row.title || "")
      .toLowerCase()
      .trim()
    if (title.length < minLen) continue
    if (!lower.includes(title)) continue
    if (title.length > bestLen) {
      best = row
      bestLen = title.length
    }
  }
  return best
}

type TopicPattern = { topic: AssistTopic; patterns: RegExp[]; weight?: number }

const TOPIC_PATTERNS: TopicPattern[] = [
  {
    topic: "greeting",
    patterns: [/^(hi|hello|hey|good (morning|afternoon|evening)|howdy)\b/, /\bthanks?\b/, /\bthank you\b/],
    weight: 3,
  },
  {
    topic: "help",
    patterns: [/\b(help|what can you|how do i ask|examples?|capabilities)\b/, /^what do you do\b/],
    weight: 3,
  },
  {
    topic: "risks",
    patterns: [
      /\brisks?\b/,
      /\bseverity\b/,
      /\bmitigat(?:e|ion|ing)?\b/,
      /\bthreats?\b/,
      /\bissues?\b/,
      /\bexposures?\b/,
      /\bwhat could go wrong\b/,
      /\bconcern(?:s|ed)?\b/,
    ],
  },
  {
    topic: "decisions",
    patterns: [
      /\bdecisions?\b/,
      /\bapprovals?\b/,
      /\bapprov(?:e|ed|al|als|ing)?\b/,
      /\bgovernance\b/,
      /\bawaiting (outcome|approval|decision)\b/,
      /\bpending (decision|approval)\b/,
      /\bsign[- ]?off\b/,
    ],
  },
  {
    topic: "budget",
    patterns: [
      /\bbudgets?\b/,
      /\bspend(?:ing|t)?\b/,
      /\bfinanc(?:e|ial|ials)?\b/,
      /\bcapex\b/,
      /\bopex\b/,
      /\bcosts?\b/,
      /\bmoney\b/,
      /\bfunding\b/,
      /\bincurred\b/,
      /\bhow much (have we|did we|is|are)\b/,
      /\boverspend\b/,
      /\bunderspend\b/,
    ],
  },
  {
    topic: "health",
    patterns: [
      /\bhealth\b/,
      /\brag\b/,
      /\bamber\b/,
      /\bred projects?\b/,
      /\bgreen projects?\b/,
      /\bon track\b/,
      /\boff track\b/,
      /\bat risk\b/,
      /\btraffic light\b/,
      /\bhow (is|are) (the )?portfolio\b/,
      /\bhow (is|are) (we|things) (going|tracking)\b/,
    ],
  },
  {
    topic: "actions",
    patterns: [
      /\bactions?\b/,
      /\boverdue\b/,
      /\btasks?\b/,
      /\btodos?\b/,
      /\bmy work\b/,
      /\bfollow[- ]?ups?\b/,
      /\boutstanding work\b/,
      /\bpast due\b/,
    ],
  },
  {
    topic: "benefits",
    patterns: [/\bbenefits?\b/, /\broi\b/, /\bvalue realised\b/, /\bvalue realized\b/, /\brealisation\b/, /\brealization\b/],
  },
  {
    topic: "attention",
    patterns: [
      /\battention\b/,
      /\bthis week\b/,
      /\bfocus\b/,
      /\bpriorit(?:y|ies|ise|ize)\b/,
      /\burgent\b/,
      /\btriage\b/,
      /\bneeds attention\b/,
      /\bwhat should i (do|look at|focus)\b/,
      /\bwhere should i (start|look|focus)\b/,
      /\btop (issues|problems|concerns)\b/,
      /\bhotspots?\b/,
    ],
  },
  {
    topic: "projects",
    patterns: [
      /\bprojects?\b/,
      /\binitiatives?\b/,
      /\bprogrammes?\b/,
      /\bprograms?\b/,
      /\blist (all )?projects\b/,
      /\bhow many projects\b/,
      /\bwhich projects\b/,
    ],
  },
  {
    topic: "overview",
    patterns: [
      /\boverview\b/,
      /\bsummary\b/,
      /\bsummarise\b/,
      /\bsummarize\b/,
      /\bsnapshot\b/,
      /\bdashboard\b/,
      /\bbig picture\b/,
      /\boverall\b/,
      /\bhow are we doing\b/,
      /\bgive me (a |the )?brief\b/,
    ],
  },
]

function scoreTopics(q: string): Array<{ topic: AssistTopic; score: number }> {
  const scores = new Map<AssistTopic, number>()
  for (const { topic, patterns, weight = 2 } of TOPIC_PATTERNS) {
    let score = 0
    for (const re of patterns) {
      if (re.test(q)) score += weight
    }
    if (score > 0) scores.set(topic, (scores.get(topic) || 0) + score)
  }
  return [...scores.entries()]
    .map(([topic, score]) => ({ topic, score }))
    .sort((a, b) => b.score - a.score)
}

function detectRag(q: string): "Red" | "Amber" | "Green" | null {
  if (/\b(red|off track|critical status)\b/.test(q)) return "Red"
  if (/\b(amber|orange|at risk|watch)\b/.test(q)) return "Amber"
  if (/\b(green|on track|healthy)\b/.test(q) && !/\b(not green|non[- ]green)\b/.test(q)) return "Green"
  return null
}

export function parseAssistQuery(raw: string, data: AssistBundle): ParsedAssistQuery {
  const q = normalize(raw)
  const projectsHit = mentionedProjects(q, data.projects)
  const topicScores = scoreTopics(q)
  const topics = topicScores.filter((t) => t.score >= 2).map((t) => t.topic)
  const rag = detectRag(q)

  // RAG colour questions are about health, not a bare project list
  if (rag && !topics.includes("health")) topics.push("health")
  // “why should I care / what’s wrong” → include risks with health
  if (
    rag &&
    /\b(why|care|wrong|worry|concern|problem|issue|risk)\b/.test(q) &&
    !topics.includes("risks")
  ) {
    topics.push("risks")
  }

  // If user named a project and no clear topic, treat as project deep-dive
  if (!topics.length && projectsHit.length) topics.push("projects")
  if (!topics.length) {
    if (/\b(hi|hello|hey)\b/.test(q)) topics.push("greeting")
    else topics.push("overview")
  }

  // Drop greeting when mixed with real topics
  const cleaned =
    topics.length > 1 ? topics.filter((t) => t !== "greeting" && t !== "help") : topics

  // Prefer health over generic projects when a RAG filter is present
  const ordered: AssistTopic[] =
    rag && cleaned.includes("health")
      ? (["health", ...cleaned.filter((t) => t !== "health" && t !== "projects")] as AssistTopic[])
      : cleaned

  return {
    topics: ordered,
    project: projectsHit[0] ?? null,
    projects: projectsHit,
    rag,
    criticalOnly: /\b(critical|high severity|sev(?:erity)?\s*(>=|≥)?\s*15|severe)\b/.test(q),
    overdueOnly: /\b(overdue|past due|late|slipped)\b/.test(q),
    listMode:
      /\b(list|which|show( me)?|name|enumerate|details?|break\s*down|breakdown)\b/.test(q) ||
      /\bwhat are\b/.test(q),
    countMode: /\b(how many|count|number of|# of)\b/.test(q),
    whoMode: /\b(who|owner|owned by|responsible)\b/.test(q),
    topMode: /\b(top|highest|biggest|worst|most|largest|greatest)\b/.test(q),
    compareMode: /\b(compare|versus|vs\.?|difference between)\b/.test(q),
    matchedRisk: matchByTitle(q, data.risks),
    matchedDecision: matchByTitle(q, data.decisions),
    matchedAction: matchByTitle(q, data.actions || []),
    raw: q,
  }
}

/** @deprecated use parseAssistQuery — kept for callers/tests */
export function detectIntent(q: string): AssistTopic {
  const scores = scoreTopics(normalize(q))
  return scores[0]?.topic || "overview"
}

function bullets(lines: string[], limit = 8): string {
  return lines
    .slice(0, limit)
    .map((l) => `• ${l}`)
    .join("\n")
}

function answerGreeting(): string {
  return [
    "Hello — I’m In-house AI for your portfolio.",
    "Ask in plain English, for example:",
    "• Which projects are Red and what are their open risks?",
    "• Who owns the highest severity risks?",
    "• How much have we spent versus budget on Alpha?",
    "• What is overdue this week?",
    "I answer from live org data in this browser session (RLS). Nothing is sent to an external model.",
  ].join("\n")
}

function answerHelp(): string {
  return [
    "I understand natural questions about your live PMO data — not just single keywords.",
    "",
    "You can ask things like:",
    "• “Which projects are amber and overspending?”",
    "• “List critical open risks with owners”",
    "• “What decisions are still awaiting approval?”",
    "• “Tell me about <project name> in detail”",
    "• “What’s overdue, and who owns those actions?”",
    "• “How are benefits tracking versus target?”",
    "",
    "I stay inside your organisation session — no ChatGPT or external AI.",
  ].join("\n")
}

function answerOverview(data: AssistBundle): string {
  const { projects, risks, decisions, actions = [] } = data
  const red = projects.filter((p) => p.rag === "Red")
  const amber = projects.filter((p) => p.rag === "Amber")
  const green = projects.filter((p) => p.rag === "Green")
  const openRisks = risks.filter(openRisk)
  const pending = decisions.filter(pendingDecision)
  const overdue = actions.filter(overdueAction)
  const budget = projects.reduce((s, p) => s + Number(p.budget || 0), 0)
  const incurred = projects.reduce(
    (s, p) => s + Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0),
    0,
  )

  const lines = [
    `Here’s a plain-English snapshot of your portfolio right now:`,
    "",
    `Projects: ${projects.length} total — ${red.length} Red, ${amber.length} Amber, ${green.length} Green.`,
    `Spend: ${money(incurred)} incurred against ${money(budget)} budgeted.`,
    `Open / mitigating risks: ${openRisks.length}. Decisions awaiting outcome: ${pending.length}. Overdue actions: ${overdue.length}.`,
  ]

  if (red.length) {
    lines.push("", `Red projects: ${red.map((p) => projectName(p)).slice(0, 6).join("; ")}${red.length > 6 ? "…" : ""}.`)
  }
  lines.push("", "Ask a follow-up in everyday English — e.g. “why is <project> red?” or “list the top risks”.")
  return lines.join("\n")
}

function answerHealth(data: AssistBundle, query: ParsedAssistQuery): string {
  let list = data.projects
  if (query.rag) list = list.filter((p) => p.rag === query.rag)
  if (query.project) list = list.filter((p) => p.id === query.project!.id)

  const red = data.projects.filter((p) => p.rag === "Red")
  const amber = data.projects.filter((p) => p.rag === "Amber")
  const green = data.projects.filter((p) => p.rag === "Green")

  if (query.project) {
    const p = query.project
    const open = data.risks.filter((r) => r.project_id === p.id && openRisk(r))
    return [
      `${projectName(p)} is currently RAG ${p.rag || "—"} with status ${p.status || "—"}.`,
      p.current_phase ? `Phase: ${p.current_phase}.` : "",
      `Open risks on this project: ${open.length}.`,
      open[0]
        ? `Example risk: “${open[0].title}” (severity ${open[0].severity ?? "—"}${open[0].owner ? `, owner ${open[0].owner}` : ""}).`
        : "No open risks recorded on this project.",
    ]
      .filter(Boolean)
      .join(" ")
  }

  const focus = query.rag ? list : [...red, ...amber]
  const detail = (query.listMode || query.rag ? focus : red)
    .slice(0, 10)
    .map((p) => {
      const open = data.risks.filter((r) => r.project_id === p.id && openRisk(r))
      const top = [...open].sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))[0]
      const incurred = Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0)
      const budget = Number(p.budget || 0)
      const spend =
        budget > 0 ? `, spend ${Math.round((incurred / budget) * 100)}% of budget` : ""
      const riskBit = top
        ? `, top risk “${top.title}” (sev ${top.severity ?? "—"})`
        : open.length
          ? `, ${open.length} open risks`
          : ""
      return `${projectName(p)} — RAG ${p.rag || "—"}, ${p.status || "—"}, phase ${p.current_phase || "—"}${spend}${riskBit}`
    })

  return [
    query.rag
      ? `Projects marked ${query.rag}: ${list.length} of ${data.projects.length}. These are the ones to watch first because RAG is off-track.`
      : `Portfolio health: ${red.length} Red, ${amber.length} Amber, ${green.length} Green (of ${data.projects.length}).`,
    "",
    detail.length
      ? query.rag
        ? `Detail:\n${bullets(detail)}`
        : `Needs attention first:\n${bullets(detail)}`
      : "No matching projects.",
  ].join("\n")
}

function answerRisks(data: AssistBundle, query: ParsedAssistQuery): string {
  if (query.matchedRisk) {
    const r = query.matchedRisk
    const p = projectById(data.projects, r.project_id)
    return [
      `Risk “${r.title || "Untitled"}” on ${projectName(p)}.`,
      `Status: ${r.status || "—"} · Severity: ${r.severity ?? "—"} · Owner: ${r.owner || "unassigned"}.`,
      r.category ? `Category: ${r.category}.` : "",
      r.mitigation ? `Mitigation: ${r.mitigation}` : "No mitigation notes recorded.",
      r.description ? `Detail: ${String(r.description).slice(0, 280)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  let rows = data.risks.filter(openRisk)
  if (query.project) rows = rows.filter((r) => r.project_id === query.project!.id)
  if (query.criticalOnly) rows = rows.filter((r) => Number(r.severity || 0) >= 15)
  rows = [...rows].sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))

  if (query.countMode && !query.listMode) {
    return query.criticalOnly
      ? `There are ${rows.length} open critical/high risks${query.project ? ` on ${projectName(query.project)}` : ""}.`
      : `There are ${rows.length} open or mitigating risks${query.project ? ` on ${projectName(query.project)}` : ""}.`
  }

  if (query.whoMode) {
    const byOwner = new Map<string, number>()
    for (const r of rows) {
      const o = r.owner?.trim() || "Unassigned"
      byOwner.set(o, (byOwner.get(o) || 0) + 1)
    }
    const ranked = [...byOwner.entries()].sort((a, b) => b[1] - a[1])
    return [
      `Risk ownership across ${rows.length} open risks:`,
      bullets(
        ranked.slice(0, 8).map(([o, n]) => `${o}: ${n} risk${n === 1 ? "" : "s"}`),
        8,
      ),
      rows[0] ? `\nHighest severity sits with ${rows[0].owner || "Unassigned"} — “${rows[0].title}” (sev ${rows[0].severity ?? "—"}).` : "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const limit = query.topMode ? 5 : 10
  const lines = rows.slice(0, limit).map((r) => {
    const p = projectById(data.projects, r.project_id)
    return `“${r.title || "Untitled"}” — sev ${r.severity ?? "—"}, ${r.status || "—"}, owner ${r.owner || "unassigned"} · ${projectName(p)}`
  })

  if (!lines.length) {
    return query.project
      ? `No open risks on ${projectName(query.project)}.`
      : "No open or mitigating risks in your current portfolio view."
  }

  return [
    `${query.criticalOnly ? "Critical/high open risks" : "Open risks"}${query.project ? ` on ${projectName(query.project)}` : ""}: ${rows.length} (showing ${lines.length}).`,
    "",
    bullets(lines, limit),
    rows.length > limit ? `\nAsk “list more risks” or name a project to go deeper.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function answerDecisions(data: AssistBundle, query: ParsedAssistQuery): string {
  if (query.matchedDecision) {
    const d = query.matchedDecision
    const p = projectById(data.projects, d.project_id)
    return [
      `Decision “${d.title || "Untitled"}” — ${projectName(p)}.`,
      `Outcome/status: ${d.outcome || d.status || "—"}.`,
      d.forum ? `Forum: ${d.forum}.` : "",
      d.sponsor || d.decided_by ? `Sponsor/decided by: ${d.sponsor || d.decided_by}.` : "",
      d.description ? `Detail: ${String(d.description).slice(0, 280)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  let rows = data.decisions.filter(pendingDecision)
  if (query.project) rows = rows.filter((d) => d.project_id === query.project!.id)

  if (query.countMode && !query.listMode) {
    return `There are ${rows.length} decisions still pending or in review${query.project ? ` on ${projectName(query.project)}` : ""}.`
  }

  const lines = rows.slice(0, 10).map((d) => {
    const p = projectById(data.projects, d.project_id)
    return `“${d.title || "Untitled"}” — ${d.outcome || d.status || "Pending"} · ${projectName(p)}${d.forum ? ` · ${d.forum}` : ""}`
  })

  if (!lines.length) {
    return query.project
      ? `No pending decisions on ${projectName(query.project)}.`
      : "No decisions are currently pending or in review."
  }

  return [
    `Decisions awaiting outcome${query.project ? ` on ${projectName(query.project)}` : ""}: ${rows.length}.`,
    "",
    bullets(lines),
    "",
    "Clear these via My Work → Approvals when ready.",
  ].join("\n")
}

function answerBudget(data: AssistBundle, query: ParsedAssistQuery): string {
  const rows = (query.projects.length ? query.projects : query.project ? [query.project] : data.projects).map(
    (p) => {
      const budget = Number(p.budget || 0)
      const incurred = Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0)
      const pct = budget > 0 ? Math.round((incurred / budget) * 100) : null
      return { p, budget, incurred, pct }
    },
  )

  if (query.compareMode && rows.length >= 2) {
    const [a, b] = rows
    return [
      `Comparing spend:`,
      `• ${projectName(a.p)}: ${money(a.incurred)} incurred / ${money(a.budget)} budget${a.pct != null ? ` (${a.pct}%)` : ""}`,
      `• ${projectName(b.p)}: ${money(b.incurred)} incurred / ${money(b.budget)} budget${b.pct != null ? ` (${b.pct}%)` : ""}`,
    ].join("\n")
  }

  if (query.project || query.projects.length === 1) {
    const r = rows[0]
    return [
      `Budget for ${projectName(r.p)}:`,
      `• Budget: ${money(r.budget)}`,
      `• Incurred (CapEx+OpEx): ${money(r.incurred)}${r.pct != null ? ` (${r.pct}% of budget)` : ""}`,
      `• CapEx incurred: ${money(Number(r.p.capex_incurred || 0))} · OpEx incurred: ${money(Number(r.p.opex_incurred || 0))}`,
      r.pct != null && r.pct >= 100 ? "This project is at or over its budget allocation." : "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalIncurred = rows.reduce((s, r) => s + r.incurred, 0)
  const ranked = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
  const over = ranked.filter((r) => r.pct != null && r.pct >= 100)
  const pressure = ranked.filter((r) => r.budget > 0).slice(0, 8)

  return [
    `Portfolio budget: ${money(totalIncurred)} incurred of ${money(totalBudget)} across ${rows.length} projects.`,
    over.length ? `${over.length} project(s) are at or over 100% of budget.` : "No projects are at or over 100% of budget.",
    "",
    query.listMode || query.topMode || query.topics.includes("budget")
      ? `Highest budget pressure:\n${bullets(
          pressure.map(
            (r) =>
              `${projectName(r.p)}: ${money(r.incurred)} / ${money(r.budget)}${r.pct != null ? ` (${r.pct}%)` : ""}`,
          ),
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function answerActions(data: AssistBundle, query: ParsedAssistQuery): string {
  if (query.matchedAction) {
    const a = query.matchedAction
    const p = projectById(data.projects, a.project_id)
    return [
      `Action “${a.title || "Untitled"}” — ${projectName(p)}.`,
      `Status: ${a.status || "—"} · Due: ${a.due_date || "—"} · Owner: ${a.owner || "unassigned"}.`,
      a.priority ? `Priority: ${a.priority}.` : "",
      a.description ? `Detail: ${String(a.description).slice(0, 280)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  }

  let rows = (data.actions || []).filter(openAction)
  if (query.overdueOnly || /\boverdue\b/.test(query.raw)) rows = rows.filter(overdueAction)
  if (query.project) rows = rows.filter((a) => a.project_id === query.project!.id)
  rows = [...rows].sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))

  if (query.countMode && !query.listMode) {
    return `There are ${rows.length} ${query.overdueOnly ? "overdue" : "open"} actions${query.project ? ` on ${projectName(query.project)}` : ""}.`
  }

  const lines = rows.slice(0, 10).map((a) => {
    const p = projectById(data.projects, a.project_id)
    return `“${a.title || "Untitled"}” — due ${a.due_date || "n/a"}, ${a.status || "—"}, owner ${a.owner || "unassigned"} · ${projectName(p)}`
  })

  if (!lines.length) {
    return query.overdueOnly
      ? "No overdue actions in your current view."
      : "No open actions in your current view."
  }

  const byOwner = new Map<string, number>()
  for (const a of rows) {
    const o = a.owner?.trim() || "Unassigned"
    byOwner.set(o, (byOwner.get(o) || 0) + 1)
  }
  const ownerLines = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([o, n]) => `${o}: ${n}`)

  return [
    `${query.overdueOnly || /\boverdue\b/.test(query.raw) ? "Overdue actions" : "Open actions"}${query.project ? ` on ${projectName(query.project)}` : ""}: ${rows.length}.`,
    "",
    bullets(lines),
    query.whoMode && ownerLines.length
      ? `\nOwners:\n${bullets(ownerLines)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function answerBenefits(data: AssistBundle, query: ParsedAssistQuery): string {
  const rows = (query.project ? [query.project] : data.projects).map((p) => ({
    p,
    target: Number(p.benefits_target || 0),
    realised: Number(p.benefits_realised || 0),
  }))
  const target = rows.reduce((s, r) => s + r.target, 0)
  const realised = rows.reduce((s, r) => s + r.realised, 0)

  if (query.project) {
    const r = rows[0]
    return [
      `Benefits for ${projectName(r.p)}: realised ${money(r.realised)} of ${money(r.target)} target.`,
    ].join("\n")
  }

  const withTarget = rows
    .filter((r) => r.target > 0 || r.realised > 0)
    .sort((a, b) => b.realised - a.realised)
    .slice(0, 8)

  return [
    `Portfolio benefits: ${money(realised)} realised vs ${money(target)} target.`,
    withTarget.length
      ? `\nBy project:\n${bullets(
          withTarget.map((r) => `${projectName(r.p)}: ${money(r.realised)} / ${money(r.target)}`),
        )}`
      : "\nNo benefits figures on projects in this view yet.",
  ].join("\n")
}

function answerProjects(data: AssistBundle, query: ParsedAssistQuery): string {
  if (query.project && query.topics.length <= 1) {
    return answerProjectDetail(query.project, data)
  }

  let list = data.projects
  if (query.rag) list = list.filter((p) => p.rag === query.rag)

  if (query.countMode && !query.listMode) {
    return query.rag
      ? `There are ${list.length} ${query.rag} projects (of ${data.projects.length}).`
      : `There are ${data.projects.length} projects in your current portfolio view.`
  }

  if (query.topMode && /\b(budget|spend|cost)\b/.test(query.raw)) {
    const ranked = [...list].sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0)).slice(0, 8)
    return [
      "Largest budgets:",
      bullets(ranked.map((p) => `${projectName(p)} — ${money(Number(p.budget || 0))} · RAG ${p.rag || "—"}`)),
    ].join("\n")
  }

  const lines = list.slice(0, 12).map((p) => {
    return `${projectName(p)} — RAG ${p.rag || "—"}, ${p.status || "—"}, phase ${p.current_phase || "—"}, budget ${money(Number(p.budget || 0))}`
  })

  return [
    query.rag ? `${query.rag} projects (${list.length}):` : `Projects in view (${list.length}):`,
    "",
    bullets(lines, 12),
    list.length > 12 ? "\nName a project for a full brief." : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function answerProjectDetail(p: AssistProject, data: AssistBundle): string {
  const risks = data.risks.filter((r) => r.project_id === p.id && openRisk(r))
  const decisions = data.decisions.filter((d) => d.project_id === p.id && pendingDecision(d))
  const actions = (data.actions || []).filter((a) => a.project_id === p.id && openAction(a))
  const overdue = actions.filter(overdueAction)
  const incurred = Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0)
  const budget = Number(p.budget || 0)

  return [
    `Here’s what I know about ${projectName(p)}:`,
    "",
    `• RAG: ${p.rag || "—"} · Status: ${p.status || "—"} · Phase: ${p.current_phase || "—"}`,
    `• Priority: ${p.priority || "—"} · Sponsor: ${p.sponsor || "—"}`,
    `• Portfolio / programme: ${p.portfolio || "—"} / ${p.program || "—"}`,
    `• Budget ${money(budget)}; incurred ${money(incurred)}${budget > 0 ? ` (${Math.round((incurred / budget) * 100)}%)` : ""}`,
    `• Benefits realised ${money(Number(p.benefits_realised || 0))} of ${money(Number(p.benefits_target || 0))} target`,
    `• Dates: start ${p.start_date || "—"} · end ${p.end_date || p.planned_end_date || "—"} · go-live ${p.target_go_live || "—"}`,
    "",
    `Open risks: ${risks.length}${risks[0] ? ` — top: “${risks[0].title}” (sev ${risks[0].severity ?? "—"})` : ""}`,
    `Pending decisions: ${decisions.length}${decisions[0] ? ` — e.g. “${decisions[0].title}”` : ""}`,
    `Open actions: ${actions.length}${overdue.length ? ` (${overdue.length} overdue)` : ""}`,
    "",
    "Ask for risks, budget, or approvals on this project specifically if you want that slice only.",
  ].join("\n")
}

function answerAttention(data: AssistBundle): string {
  const red = data.projects.filter((p) => p.rag === "Red")
  const critical = data.risks.filter((r) => openRisk(r) && Number(r.severity || 0) >= 15)
  const pending = data.decisions.filter(pendingDecision)
  const overdue = (data.actions || []).filter(overdueAction)

  const lines: string[] = []
  if (red.length) {
    lines.push(
      `Triage ${red.length} Red project(s): ${red
        .slice(0, 4)
        .map((p) => projectName(p))
        .join("; ")}.`,
    )
  }
  if (critical.length) {
    const top = [...critical].sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))[0]
    const p = projectById(data.projects, top.project_id)
    lines.push(
      `Review ${critical.length} critical risks — highest is “${top.title}” on ${projectName(p)} (sev ${top.severity ?? "—"}, owner ${top.owner || "unassigned"}).`,
    )
  }
  if (pending.length) {
    lines.push(`Clear ${pending.length} pending decision(s), starting with “${pending[0].title || "Untitled"}”.`)
  }
  if (overdue.length) {
    lines.push(
      `Chase ${overdue.length} overdue action(s) — e.g. “${overdue[0].title}” (owner ${overdue[0].owner || "unassigned"}).`,
    )
  }
  if (!lines.length) {
    return "Nothing urgent stands out — no Red projects, critical risks, pending decisions, or overdue actions in this view."
  }

  return ["What needs attention this week:", "", bullets(lines, 8)].join("\n")
}

function composeMulti(data: AssistBundle, query: ParsedAssistQuery): string {
  const parts: string[] = []
  const topics = query.topics.filter((t) => !["greeting", "help", "overview", "attention", "projects"].includes(t))

  // Specific entity match wins
  if (query.matchedRisk) return answerRisks(data, query)
  if (query.matchedDecision) return answerDecisions(data, query)
  if (query.matchedAction) return answerActions(data, query)

  if (query.topics.includes("greeting") && query.topics.length === 1) return answerGreeting()
  if (query.topics.includes("help") && query.topics.length === 1) return answerHelp()
  if (query.topics.includes("attention") && topics.length === 0) return answerAttention(data)
  if (query.topics.includes("overview") && topics.length === 0 && !query.project) return answerOverview(data)

  // Project-only deep dive
  if (query.project && topics.length === 0) return answerProjectDetail(query.project, data)

  for (const topic of topics.length ? topics : query.topics) {
    switch (topic) {
      case "risks":
        parts.push(answerRisks(data, query))
        break
      case "decisions":
        parts.push(answerDecisions(data, query))
        break
      case "budget":
        parts.push(answerBudget(data, query))
        break
      case "health":
        parts.push(answerHealth(data, query))
        break
      case "actions":
        parts.push(answerActions(data, query))
        break
      case "benefits":
        parts.push(answerBenefits(data, query))
        break
      case "projects":
        parts.push(answerProjects(data, query))
        break
      case "attention":
        parts.push(answerAttention(data))
        break
      case "overview":
        parts.push(answerOverview(data))
        break
      default:
        break
    }
  }

  if (!parts.length) {
    if (query.project) return answerProjectDetail(query.project, data)
    return answerOverview(data)
  }

  // De-dupe identical blocks and join with spacing
  const unique = [...new Set(parts)]
  return unique.join("\n\n")
}

export type AnswerAssistOptions = {
  /** When set, topics outside these domains are refused / stripped. */
  allowedDomains?: Set<
    "projects" | "risks" | "decisions" | "actions" | "budget" | "benefits"
  >
  /** Optional notice prepended when some domains are denied by page ACL. */
  accessNote?: string | null
}

const TOPIC_TO_DOMAIN: Partial<
  Record<AssistTopic, "projects" | "risks" | "decisions" | "actions" | "budget" | "benefits">
> = {
  risks: "risks",
  decisions: "decisions",
  actions: "actions",
  budget: "budget",
  benefits: "benefits",
  health: "projects",
  projects: "projects",
  overview: "projects",
  attention: "projects",
}

function applyDomainAcl(query: ParsedAssistQuery, opts?: AnswerAssistOptions): ParsedAssistQuery {
  const domains = opts?.allowedDomains
  if (!domains) return query

  const topics = query.topics.filter((t) => {
    if (t === "help" || t === "greeting") return true
    const domain = TOPIC_TO_DOMAIN[t]
    if (!domain) return true
    return domains.has(domain)
  })

  // If the only ask was a denied domain, explain instead of falling back to overview
  const askedDenied = query.topics.some((t) => {
    const domain = TOPIC_TO_DOMAIN[t]
    return domain != null && !domains.has(domain)
  })

  return {
    ...query,
    topics: topics.length ? topics : askedDenied ? ["help"] : ["overview"],
    // Clear entity matches outside allowed domains
    matchedRisk: domains.has("risks") ? query.matchedRisk : null,
    matchedDecision: domains.has("decisions") ? query.matchedDecision : null,
    matchedAction: domains.has("actions") ? query.matchedAction : null,
  }
}

export function answerPortfolioQuestion(
  raw: string,
  data: AssistBundle,
  opts?: AnswerAssistOptions,
): string {
  const q = raw.trim()
  if (!q) return answerHelp()

  const query = applyDomainAcl(parseAssistQuery(q, data), opts)
  const body = composeMulti(data, query)

  // Explicit denial when user asked only about a blocked domain
  if (
    opts?.allowedDomains &&
    query.topics.length === 1 &&
    query.topics[0] === "help"
  ) {
    const original = parseAssistQuery(q, data)
    const denied = original.topics.filter((t) => {
      const domain = TOPIC_TO_DOMAIN[t]
      return domain != null && !opts.allowedDomains!.has(domain)
    })
    if (denied.length) {
      return [
        `I can’t answer about ${denied.join(", ")} for your role — that area is blocked by your organisation’s page permissions.`,
        opts.accessNote || "",
        "",
        answerHelp(),
      ]
        .filter(Boolean)
        .join("\n")
    }
  }

  return body
}
