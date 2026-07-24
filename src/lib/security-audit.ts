/**
 * Server-side security / compliance event logging.
 * Prefer writing via service role so events cannot be forged by end users.
 */
export type SecurityEventType =
  | "login"
  | "logout"
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
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = input.orgId ?? null;
    if (!orgId) {
      // audit_events.org_id is NOT NULL — fall back to structured server log only.
      console.info("[security-event]", JSON.stringify({ ...input, at: new Date().toISOString() }));
      return;
    }

    // Generated Database types may lag migrations that added audit_events.
    const { error } = await (supabaseAdmin as any).from("audit_events").insert({
      org_id: orgId,
      actor_user_id: input.actorUserId ?? null,
      entity_type: input.entityType ?? "security",
      entity_id: input.entityId ?? null,
      action: input.eventType,
      summary: input.summary.slice(0, 500),
      meta: {
        ...(input.meta ?? {}),
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        at: new Date().toISOString(),
      },
    });
    if (error) {
      console.error("[security-event] insert failed", error.message);
      console.info("[security-event]", JSON.stringify({ ...input, at: new Date().toISOString() }));
    }
  } catch (e) {
    console.error("[security-event] unexpected", e);
  }
}
