/**
 * Stage-gate status changes are recorded as Decisions.
 * Inserting a decision with stage_gate_id + outcome updates the linked gate
 * (DB trigger) and every same-name row on the project (setStageGateStatus).
 */
import { supabase } from "@/integrations/supabase/client";
import { setStageGateStatus } from "@/lib/stage-gate-approval";
import {
  buildStageGateDecisionRow,
  type StageGateDecisionInput,
} from "@/lib/stage-gate-decision-fields";

export {
  buildStageGateDecisionRow,
  defaultStageGateDecisionTitle,
  type StageGateDecisionInput,
} from "@/lib/stage-gate-decision-fields";

/** Insert a decision for a gate, then lockstep every matching gate row. */
export async function recordStageGateDecision(input: StageGateDecisionInput) {
  if (!input.orgId) throw new Error("Organisation required");
  if (!input.projectId) throw new Error("Project required");
  if (!input.stageGateId) throw new Error("Stage gate required");
  if (!String(input.title || "").trim()) throw new Error("Project and title required");
  if (!input.approverUserId) throw new Error("Select an approver to notify");

  const row = buildStageGateDecisionRow(input);
  const { error } = await supabase.from("decisions").insert(row as never);
  if (error) throw error;

  await setStageGateStatus({
    gateId: input.stageGateId,
    projectId: input.projectId,
    status: row.outcome,
  });
}

/** After a Decision-page save, keep project / stream / list gates in lockstep. */
export async function applyDecisionToStageGate(opts: {
  gateId?: string | null;
  projectId?: string | null;
  status?: string | null;
}) {
  if (!opts.gateId || !opts.projectId || !opts.status) return;
  await setStageGateStatus({
    gateId: opts.gateId,
    projectId: opts.projectId,
    status: opts.status,
  });
}
