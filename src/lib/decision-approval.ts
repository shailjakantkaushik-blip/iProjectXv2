export const DECISION_OUTCOMES = [
  "Pending",
  "In Review",
  "Approved",
  "Rejected",
  "On Hold",
] as const;

export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const DECISION_OUTCOME_CLASS: Record<DecisionOutcome, string> = {
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-rose-100 text-rose-800",
  "On Hold": "bg-amber-100 text-amber-800",
  "In Review": "bg-sky-100 text-sky-800",
  Pending: "bg-slate-100 text-slate-700",
};

export type OrgMember = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type DecisionOutcomeLike = {
  outcome?: string | null;
  /** Legacy seed / Excel often wrote the state here instead of `outcome`. */
  status?: string | null;
};

export function memberLabel(m: OrgMember) {
  return m.full_name?.trim() || m.email || m.id.slice(0, 8);
}

/**
 * Map free-text / legacy status values onto the five canonical outcomes.
 * Empty → Pending so awaiting decisions still appear on the Outcomes chart.
 */
export function normalizeDecisionOutcome(raw?: string | null): DecisionOutcome {
  const s = String(raw || "").trim();
  if (!s) return "Pending";
  const key = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  for (const o of DECISION_OUTCOMES) {
    if (o.toLowerCase() === key) return o;
  }
  if (key === "open" || key === "new" || key === "draft" || key === "todo") return "Pending";
  if (
    key === "awaiting" ||
    key === "awaiting approval" ||
    key === "submitted" ||
    key === "under review" ||
    key === "review"
  ) {
    return "In Review";
  }
  if (key === "closed" || key === "complete" || key === "completed" || key === "accepted") {
    return "Approved";
  }
  if (key === "declined" || key === "denied" || key === "refuse" || key === "refused") {
    return "Rejected";
  }
  if (key === "deferred" || key === "hold" || key === "parked" || key === "paused") {
    return "On Hold";
  }
  // Unknown labels still surface as Pending rather than vanishing from the chart.
  return "Pending";
}

/** Prefer `outcome`, fall back to legacy `status`. */
export function decisionOutcome(d: DecisionOutcomeLike | null | undefined): DecisionOutcome {
  return normalizeDecisionOutcome(d?.outcome || d?.status);
}

export function isAwaitingApproval(outcome?: string | null) {
  const o = normalizeDecisionOutcome(outcome);
  return o === "Pending" || o === "In Review";
}

export function isDecisionAwaiting(d: DecisionOutcomeLike | null | undefined) {
  return isAwaitingApproval(decisionOutcome(d));
}

export function canActOnDecision(
  decision: { approver_user_id?: string | null } & DecisionOutcomeLike,
  userId?: string | null,
) {
  if (!userId || !decision.approver_user_id) return false;
  if (decision.approver_user_id !== userId) return false;
  return isDecisionAwaiting(decision);
}
