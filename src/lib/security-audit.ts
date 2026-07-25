/**
 * Server-side security / compliance event logging.
 * Prefer writing via service role so events cannot be forged by end users.
 *
 * - Always persists to `security_events` (org_id optional) for auth/compliance.
 * - Also mirrors into `audit_events` when org_id is present (tenant audit UI).
 */
export type SecurityEventType =
  | "login"
  | "logout"
  | "login_failed"
  | "user_create"
  | "user_delete"
  | "user_activate"
  | "user_deactivate"
  | "role_assign"
  | "role_remove"
  | "password_change"
  | "org_create"
  | "project_purge"
  | "invoice_email"
  | "billing_run"
  | "eoi_submit"
  | "admin_action";

export type SecurityEventInput = {
  orgId?: string | null;
  actorUserId?: string | null;
  eventType: SecurityEventType;
  entityType?: string;
  entityId?: string | null;
  summary: string;
  email?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeSecurityEvent(input: SecurityEventInput): Promise<void> {
  const at = new Date().toISOString();
  const meta = {
    ...(input.meta ?? {}),
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    at,
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: secErr } = await (supabaseAdmin as any).from("security_events").insert({
      org_id: input.orgId ?? null,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      entity_type: input.entityType ?? "security",
      entity_id: input.entityId ?? null,
      summary: input.summary.slice(0, 500),
      email: input.email ?? null,
      meta,
    });
    if (secErr) {
      console.error("[security-event] security_events insert failed", secErr.message);
      console.info("[security-event]", JSON.stringify({ ...input, at }));
    }

    // Tenant-visible audit trail when we know the org
    if (input.orgId) {
      const { error } = await (supabaseAdmin as any).from("audit_events").insert({
        org_id: input.orgId,
        actor_user_id: input.actorUserId ?? null,
        entity_type: input.entityType ?? "security",
        entity_id: input.entityId ?? null,
        action: input.eventType,
        summary: input.summary.slice(0, 500),
        meta,
      });
      if (error) {
        console.error("[security-event] audit_events insert failed", error.message);
      }
    }
  } catch (e) {
    console.error("[security-event] unexpected", e);
    console.info("[security-event]", JSON.stringify({ ...input, at }));
  }
}
