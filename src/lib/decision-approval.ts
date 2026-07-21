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

export function memberLabel(m: OrgMember) {
  return m.full_name?.trim() || m.email || m.id.slice(0, 8);
}

export function isAwaitingApproval(outcome?: string | null) {
  return !outcome || outcome === "Pending" || outcome === "In Review";
}

export function canActOnDecision(
  decision: { approver_user_id?: string | null; outcome?: string | null },
  userId?: string | null,
) {
  if (!userId || !decision.approver_user_id) return false;
  if (decision.approver_user_id !== userId) return false;
  return isAwaitingApproval(decision.outcome);
}
