/** Allowlisted RAID columns a client may write. org_id is always the server org. */

export const RISK_PATCH_KEYS = [
  "title",
  "description",
  "category",
  "due_date",
  "impact",
  "mitigation",
  "notes",
  "owner",
  "probability",
  "project_id",
  "raid_code",
  "severity",
  "status",
  "stream_id",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
] as const;

export const ISSUE_PATCH_KEYS = [
  "title",
  "description",
  "owner",
  "priority",
  "project_id",
  "raid_code",
  "raised_date",
  "resolution",
  "resolved_date",
  "status",
  "stream_id",
  "target_date",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
] as const;

export const ACTION_PATCH_KEYS = [
  "title",
  "description",
  "completed_date",
  "due_date",
  "notes",
  "owner",
  "priority",
  "project_id",
  "raid_code",
  "status",
  "stream_id",
  "escalated_at",
  "escalation_level",
  "escalation_reason",
] as const;

export type RaidKind = "risks" | "issues" | "actions";

const KEYS: Record<RaidKind, readonly string[]> = {
  risks: RISK_PATCH_KEYS,
  issues: ISSUE_PATCH_KEYS,
  actions: ACTION_PATCH_KEYS,
};

export function pickRaidPatch(
  kind: RaidKind,
  patch: Record<string, unknown>,
  orgId: string,
): Record<string, unknown> {
  const allowed = new Set(KEYS[kind]);
  const out: Record<string, unknown> = { org_id: orgId };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "org_id" || key === "id" || !allowed.has(key)) continue;
    out[key] = value;
  }
  return out;
}
