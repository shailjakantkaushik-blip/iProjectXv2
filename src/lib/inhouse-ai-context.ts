import type { AssistBundle } from "@/lib/local-portfolio-assist";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);

function clip(s: string | null | undefined, max = 160): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function projectLabel(p: AssistBundle["projects"][number]): string {
  return p.project_code ? `${p.name || "Untitled"} (${p.project_code})` : String(p.name || "Untitled");
}

/**
 * Compact, redacted-ish context pack for the approved model.
 * Caps row counts so we never ship the full register dump.
 */
export function buildAssistContextPack(bundle: AssistBundle): string {
  const projects = bundle.projects.slice(0, 40);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const risks = (bundle.risks || []).slice(0, 30);
  const decisions = (bundle.decisions || []).slice(0, 25);
  const actions = (bundle.actions || []).slice(0, 25);

  const red = projects.filter((p) => p.rag === "Red").length;
  const amber = projects.filter((p) => p.rag === "Amber").length;
  const green = projects.filter((p) => p.rag === "Green").length;
  const budget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const incurred = projects.reduce(
    (s, p) => s + Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0),
    0,
  );

  const lines: string[] = [
    "PORTFOLIO CONTEXT (RLS-scoped; already filtered to this user's visible data)",
    `Projects: ${projects.length} (Red ${red}, Amber ${amber}, Green ${green})`,
    `Budget ${money(budget)}; incurred ${money(incurred)}`,
    "",
    "PROJECTS:",
  ];

  for (const p of projects.slice(0, 25)) {
    lines.push(
      `- ${projectLabel(p)} | RAG ${p.rag || "—"} | ${p.status || "—"} | phase ${p.current_phase || "—"} | budget ${money(Number(p.budget || 0))} | incurred ${money(Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0))} | benefits ${money(Number(p.benefits_realised || 0))}/${money(Number(p.benefits_target || 0))}`,
    );
  }

  if (risks.length) {
    lines.push("", "OPEN RISKS:");
    for (const r of risks) {
      const p = r.project_id ? byId.get(r.project_id) : null;
      lines.push(
        `- “${clip(r.title, 80)}” | sev ${r.severity ?? "—"} | ${r.status || "—"} | owner ${r.owner || "unassigned"} | ${p ? projectLabel(p) : "unknown project"}${r.mitigation ? ` | mitigation: ${clip(r.mitigation, 100)}` : ""}`,
      );
    }
  }

  if (decisions.length) {
    lines.push("", "DECISIONS:");
    for (const d of decisions) {
      const p = d.project_id ? byId.get(d.project_id) : null;
      lines.push(
        `- “${clip(d.title, 80)}” | ${d.outcome || d.status || "—"} | ${p ? projectLabel(p) : "unknown"}${d.forum ? ` | ${clip(d.forum, 40)}` : ""}`,
      );
    }
  }

  if (actions.length) {
    lines.push("", "ACTIONS:");
    for (const a of actions) {
      const p = a.project_id ? byId.get(a.project_id) : null;
      lines.push(
        `- “${clip(a.title, 80)}” | due ${a.due_date || "n/a"} | ${a.status || "—"} | owner ${a.owner || "unassigned"} | ${p ? projectLabel(p) : "unknown"}`,
      );
    }
  }

  return lines.join("\n");
}

export const INHOUSE_AI_SYSTEM_PROMPT = [
  "You are iProjectX In-house AI, a portfolio assistant for a single organisation.",
  "Answer ONLY from the provided PORTFOLIO CONTEXT. If the context lacks the answer, say so clearly.",
  "Do not invent projects, risks, owners, or numbers. Do not mention other tenants or systems.",
  "Be concise, plain English, and practical for a PMO / executive reader.",
  "Prefer short paragraphs and bullet lists. Include concrete names, owners, and amounts when present.",
  "Never ask the user to paste secrets. Never claim you are ChatGPT or an external consumer AI.",
].join(" ");
