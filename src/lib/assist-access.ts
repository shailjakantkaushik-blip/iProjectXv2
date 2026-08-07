import type { AssistBundle, AssistTopic } from "@/lib/local-portfolio-assist";

/** Page ACL paths that gate In-house AI topic domains. */
export type AssistDomain =
  | "projects"
  | "risks"
  | "decisions"
  | "actions"
  | "budget"
  | "benefits";

const DOMAIN_PAGES: Record<AssistDomain, string[]> = {
  projects: [
    "/app/projects",
    "/app/executive",
    "/app/executive-cockpit",
<<<<<<< HEAD
    "/app/portfolio-pulse",
=======
    "/app/executive-intelligence",
>>>>>>> origin/cursor/executive-intelligence-503d
    "/app/my-work",
  ],
  risks: ["/app/risks", "/app/risk-roadmap"],
  decisions: ["/app/decisions", "/app/my-work", "/app/executive-intelligence"],
  actions: ["/app/actions", "/app/my-work", "/app/executive-intelligence"],
  budget: [
    "/app/financials",
    "/app/fy-allocation",
    "/app/phase-financials",
    "/app/cost-vs-benefit",
    "/app/executive-intelligence",
  ],
  benefits: [
    "/app/benefits",
    "/app/cost-vs-benefit",
    "/app/financials",
    "/app/executive-intelligence",
  ],
};

const TOPIC_DOMAIN: Partial<Record<AssistTopic, AssistDomain>> = {
  risks: "risks",
  decisions: "decisions",
  actions: "actions",
  budget: "budget",
  benefits: "benefits",
  health: "projects",
  projects: "projects",
  overview: "projects",
  attention: "projects",
};

/** Lean project columns for In-house AI (egress-safe vs full portfolio select). */
export const PROJECT_ASSIST_SELECT = [
  "id",
  "org_id",
  "project_code",
  "name",
  "portfolio",
  "program",
  "sponsor",
  "priority",
  "status",
  "rag",
  "budget",
  "capex_incurred",
  "opex_incurred",
  "benefits_target",
  "benefits_realised",
  "start_date",
  "end_date",
  "planned_end_date",
  "target_go_live",
  "current_phase",
].join(",");

export const RISKS_ASSIST_SELECT = [
  "id",
  "project_id",
  "title",
  "description",
  "category",
  "severity",
  "status",
  "owner",
  "mitigation",
  "due_date",
].join(",");

export const DECISIONS_ASSIST_SELECT = [
  "id",
  "project_id",
  "title",
  "description",
  "forum",
  "sponsor",
  "decided_by",
  "outcome",
  "status",
  "decision_date",
].join(",");

export const ACTIONS_ASSIST_SELECT = [
  "id",
  "project_id",
  "title",
  "description",
  "owner",
  "priority",
  "status",
  "due_date",
].join(",");

export function domainAllowed(
  domain: AssistDomain,
  canView: (path: string) => boolean,
): boolean {
  return DOMAIN_PAGES[domain].some((path) => canView(path));
}

export function allowedAssistDomains(canView: (path: string) => boolean): Set<AssistDomain> {
  const out = new Set<AssistDomain>();
  (Object.keys(DOMAIN_PAGES) as AssistDomain[]).forEach((d) => {
    if (domainAllowed(d, canView)) out.add(d);
  });
  return out;
}

/**
 * Scope AI bundle to:
 * - rows on projects the user can already see (visible project ids)
 * - domains allowed by page ACL (e.g. deny /app/risks ⇒ strip risks)
 * - optional org_id match when present on project rows
 */
export function scopeAssistBundle(
  bundle: AssistBundle,
  opts: {
    orgId: string;
    domains: Set<AssistDomain>;
  },
): AssistBundle {
  const { orgId, domains } = opts;

  let projects = bundle.projects.filter((p) => {
    const rowOrg = (p as { org_id?: string | null }).org_id;
    if (rowOrg && rowOrg !== orgId) return false;
    return true;
  });

  // Projects list is always RLS-scoped. Page ACL for "projects" only gates
  // overview/health topics (see answerPortfolioQuestion), not the join keys
  // needed for risk/decision/action attribution.
  const visibleIds = new Set(projects.map((p) => p.id));

  const risks = domains.has("risks")
    ? (bundle.risks || []).filter((r) => r.project_id && visibleIds.has(r.project_id))
    : [];
  const decisions = domains.has("decisions")
    ? (bundle.decisions || []).filter((d) => d.project_id && visibleIds.has(d.project_id))
    : [];
  const actions = domains.has("actions")
    ? (bundle.actions || []).filter((a) => a.project_id && visibleIds.has(a.project_id))
    : [];

  // Strip financial fields when budget/benefits domains denied
  if (!domains.has("budget") || !domains.has("benefits")) {
    projects = projects.map((p) => {
      const next = { ...p };
      if (!domains.has("budget")) {
        next.budget = null;
        next.capex_incurred = null;
        next.opex_incurred = null;
      }
      if (!domains.has("benefits")) {
        next.benefits_realised = null;
        next.benefits_target = null;
      }
      return next;
    });
  }

  return { projects, risks, decisions, actions };
}

/** Drop topics the user is not allowed to query based on page ACL. */
export function filterAssistTopics(
  topics: AssistTopic[],
  domains: Set<AssistDomain>,
): AssistTopic[] {
  const kept = topics.filter((t) => {
    if (t === "help" || t === "greeting") return true;
    const domain = TOPIC_DOMAIN[t];
    if (!domain) return true;
    return domains.has(domain);
  });
  return kept.length ? kept : ["help"];
}

export function deniedDomainMessage(domains: Set<AssistDomain>): string | null {
  const missing: string[] = [];
  if (!domains.has("risks")) missing.push("risks");
  if (!domains.has("decisions")) missing.push("decisions");
  if (!domains.has("actions")) missing.push("actions");
  if (!domains.has("budget")) missing.push("budget / financials");
  if (!domains.has("benefits")) missing.push("benefits");
  if (!domains.has("projects")) missing.push("projects");
  if (!missing.length) return null;
  return `Note: your role cannot access ${missing.join(", ")} in this organisation — those topics are hidden from In-house AI.`;
}
