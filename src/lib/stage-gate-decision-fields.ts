/**
 * Pure builders for stage-gate decisions (no Supabase).
 * Recording / lockstep writes live in stage-gate-decision.ts.
 */
import {
  memberLabel,
  normalizeDecisionOutcome,
  type OrgMember,
} from "@/lib/decision-approval";

export function defaultStageGateDecisionTitle(
  gateName?: string | null,
  outcome?: string | null,
) {
  const name = String(gateName || "").trim() || "Stage gate";
  return `${name} — ${normalizeDecisionOutcome(outcome)}`;
}

export type StageGateDecisionInput = {
  orgId: string;
  projectId: string;
  stageGateId: string;
  streamId?: string | null;
  program?: string | null;
  forum?: string | null;
  sponsor?: string | null;
  approverUserId: string;
  approver?: OrgMember | null;
  owner?: string | null;
  outcome: string;
  decisionDate: string;
  requiredDate?: string | null;
  title: string;
  options?: string | null;
  recommendation?: string | null;
  scheduleImpactDays?: number | null;
  costImpact?: number | null;
  rationale?: string | null;
  notes?: string | null;
};

export function buildStageGateDecisionRow(input: StageGateDecisionInput) {
  const outcome = normalizeDecisionOutcome(input.outcome);
  const title = String(input.title || "").trim();
  return {
    org_id: input.orgId,
    project_id: input.projectId,
    stream_id: input.streamId || null,
    stage_gate_id: input.stageGateId,
    program: input.program || null,
    forum: input.forum || null,
    sponsor: input.sponsor || null,
    approver_user_id: input.approverUserId,
    approvers: input.approver ? memberLabel(input.approver) : null,
    owner: input.owner || null,
    outcome,
    status: outcome,
    decision_date: input.decisionDate,
    required_date: input.requiredDate || null,
    title,
    options: input.options || null,
    recommendation: input.recommendation || null,
    schedule_impact_days: input.scheduleImpactDays ?? null,
    cost_impact: input.costImpact ?? null,
    rationale: input.rationale || null,
    notes: input.notes || null,
  };
}
