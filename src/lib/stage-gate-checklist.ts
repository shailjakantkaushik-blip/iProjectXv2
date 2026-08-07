/**
 * Stage-gate checklist governance helpers.
 * Org templates (by gate_name) → responses on each project/stream gate instance.
 */

export type ChecklistItemLike = {
  id?: string;
  gate_name?: string | null;
  title?: string | null;
  required?: boolean | null;
  sort_order?: number | null;
};

export type ChecklistResponseLike = {
  checklist_item_id: string;
  completed?: boolean | null;
};

export type GateChecklistSummary = {
  total: number;
  done: number;
  requiredTotal: number;
  requiredOpen: number;
  pct: number;
  canApprove: boolean;
  label: string;
};

/** Default checklist templates aligned to Stage Gate Config DEFAULTS. */
export const DEFAULT_GATE_CHECKLISTS: Record<
  string,
  { title: string; required: boolean; sort_order: number }[]
> = {
  Discovery: [
    { title: "Problem / opportunity statement agreed", required: true, sort_order: 10 },
    { title: "Stakeholders identified", required: true, sort_order: 20 },
    { title: "Initial options shortlist documented", required: false, sort_order: 30 },
  ],
  "Business Case / Seed Funding": [
    { title: "Draft business case attached", required: true, sort_order: 10 },
    { title: "Seed funding amount proposed", required: true, sort_order: 20 },
    { title: "Sponsor endorsement recorded", required: true, sort_order: 30 },
  ],
  Design: [
    { title: "Solution design approved", required: true, sort_order: 10 },
    { title: "Architecture / security review complete", required: true, sort_order: 20 },
    { title: "Dependencies & integration map updated", required: true, sort_order: 30 },
    { title: "Non-functional requirements captured", required: false, sort_order: 40 },
  ],
  "Business Case / Full Funding": [
    { title: "Full business case approved", required: true, sort_order: 10 },
    { title: "Budget & benefits baseline set", required: true, sort_order: 20 },
    { title: "Delivery approach confirmed", required: true, sort_order: 30 },
  ],
  Build: [
    { title: "Delivery plan current", required: true, sort_order: 10 },
    { title: "RAID log reviewed this stage", required: true, sort_order: 20 },
    { title: "Build quality checks passed", required: true, sort_order: 30 },
    { title: "Benefits tracker live", required: false, sort_order: 40 },
  ],
  Testing: [
    { title: "Test strategy / plan approved", required: true, sort_order: 10 },
    { title: "UAT / acceptance criteria signed off", required: true, sort_order: 20 },
    { title: "Defects at exit criteria", required: true, sort_order: 30 },
    { title: "Security / performance tests complete", required: false, sort_order: 40 },
  ],
  Deployment: [
    { title: "Go-live readiness checklist complete", required: true, sort_order: 10 },
    { title: "Rollback plan documented", required: true, sort_order: 20 },
    { title: "Support / ops handover confirmed", required: true, sort_order: 30 },
  ],
  Handover: [
    { title: "Operational documentation handed over", required: true, sort_order: 10 },
    { title: "Training completed", required: true, sort_order: 20 },
    { title: "Warranty / hypercare plan agreed", required: false, sort_order: 30 },
  ],
  "Benefit Realisation": [
    { title: "Benefits measures baseline confirmed", required: true, sort_order: 10 },
    { title: "Owner for each benefit assigned", required: true, sort_order: 20 },
    { title: "First benefits review scheduled", required: true, sort_order: 30 },
  ],
};

export function summarizeGateChecklist(
  items: ChecklistItemLike[],
  responses: ChecklistResponseLike[],
): GateChecklistSummary {
  const respByItem = new Map(responses.map((r) => [r.checklist_item_id, r]));
  const total = items.length;
  const done = items.filter((i) => i.id && respByItem.get(i.id)?.completed).length;
  const required = items.filter((i) => i.required !== false);
  const requiredTotal = required.length;
  const requiredOpen = required.filter((i) => !i.id || !respByItem.get(i.id)?.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const canApprove = requiredOpen === 0;
  const label =
    total === 0
      ? "No checklist"
      : requiredOpen > 0
        ? `${requiredOpen} required open`
        : done === total
          ? "Complete"
          : `${done}/${total} done`;
  return { total, done, requiredTotal, requiredOpen, pct, canApprove, label };
}

/** Block Approve when required checklist items remain open (and a template exists). */
export function approvalBlockedReason(summary: GateChecklistSummary): string | null {
  if (summary.total === 0) return null; // no template → do not block
  if (summary.requiredOpen > 0) {
    return `Cannot approve: ${summary.requiredOpen} required checklist item${
      summary.requiredOpen === 1 ? "" : "s"
    } still open. Complete evidence on the gate checklist first.`;
  }
  return null;
}

export async function fetchGateChecklistBlockReason(
  client: {
    from: (t: string) => any;
  },
  opts: { orgId: string; stageGateId: string; gateName: string },
): Promise<string | null> {
  const itemsRes = await client
    .from("stage_gate_checklist_items")
    .select("id,gate_name,title,required,sort_order")
    .eq("org_id", opts.orgId)
    .eq("gate_name", opts.gateName);
  if (itemsRes.error) return null; // fail open if table missing
  const items = (itemsRes.data ?? []) as ChecklistItemLike[];
  if (!items.length) return null;

  const respRes = await client
    .from("stage_gate_checklist_responses")
    .select("checklist_item_id,completed")
    .eq("stage_gate_id", opts.stageGateId);
  if (respRes.error) return null;
  const responses = (respRes.data ?? []) as ChecklistResponseLike[];
  return approvalBlockedReason(summarizeGateChecklist(items, responses));
}
