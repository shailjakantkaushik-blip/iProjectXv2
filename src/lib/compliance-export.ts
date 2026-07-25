import { format } from "date-fns";
import { toast } from "sonner";
import { writeObjectSheets } from "@/lib/excel-io";
import { recordAuthSecurityEvent } from "@/lib/auth-events.functions";
import { supabase } from "@/integrations/supabase/client";

const EXPORT_CAP = 10_000;

const META_HEADERS = ["field", "value"] as const;

const AUDIT_HEADERS = [
  "timestamp_utc",
  "action",
  "entity_type",
  "entity_id",
  "actor_user_id",
  "org_id",
  "summary",
  "meta",
] as const;

const SECURITY_HEADERS = [
  "timestamp_utc",
  "event_type",
  "email",
  "actor_user_id",
  "org_id",
  "entity_type",
  "entity_id",
  "summary",
  "meta",
] as const;

function stamp() {
  return format(new Date(), "yyyy-MM-dd");
}

function fmtTs(value: string | null | undefined) {
  if (!value) return "";
  try {
    return format(new Date(value), "yyyy-MM-dd HH:mm:ss");
  } catch {
    return value;
  }
}

function metaRows(fields: Record<string, string>) {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function logExport(summary: string, meta: Record<string, unknown>) {
  void recordAuthSecurityEvent({
    data: {
      eventType: "admin_action",
      summary: summary.slice(0, 500),
      meta,
    },
  }).catch(() => {
    /* non-blocking */
  });
}

/**
 * One-click auditor pack: org audit_events → Excel.
 * Available to org_admin / admin (and platform for support).
 */
export async function exportOrgAuditEvidence(opts?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  orgName?: string | null;
}): Promise<void> {
  const { dateFrom = null, dateTo = null, orgName = null } = opts ?? {};

  let q = (supabase as any)
    .from("audit_events")
    .select("created_at, action, entity_type, entity_id, actor_user_id, org_id, summary, meta")
    .order("created_at", { ascending: false })
    .limit(EXPORT_CAP);

  if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
  if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59.999`);

  const { data, error } = await q;
  if (error) throw error;

  const rows = ((data ?? []) as any[]).map((r) => ({
    timestamp_utc: fmtTs(r.created_at),
    action: r.action ?? "",
    entity_type: r.entity_type ?? "",
    entity_id: r.entity_id ?? "",
    actor_user_id: r.actor_user_id ?? "",
    org_id: r.org_id ?? "",
    summary: r.summary ?? "",
    meta: r.meta ? JSON.stringify(r.meta) : "",
  }));

  const capped = rows.length >= EXPORT_CAP;

  await writeObjectSheets(
    [
      {
        name: "Export_Metadata",
        headers: [...META_HEADERS],
        rows: metaRows({
          export_type: "org_audit_evidence",
          exported_at_utc: new Date().toISOString(),
          organisation: orgName ?? "",
          date_from: dateFrom ?? "(all)",
          date_to: dateTo ?? "(all)",
          row_count: String(rows.length),
          row_cap: String(EXPORT_CAP),
          note: capped
            ? "Export hit row cap — narrow the date range and export again for full coverage."
            : "Complete for selected filters.",
        }),
      },
      { name: "Audit_Events", headers: [...AUDIT_HEADERS], rows },
    ],
    `iprojectx-audit-evidence-${stamp()}.xlsx`,
  );

  logExport(`Exported ${rows.length} audit events for auditors`, {
    export_type: "org_audit_evidence",
    row_count: rows.length,
    date_from: dateFrom,
    date_to: dateTo,
    capped,
  });

  toast.success(`Exported ${rows.length.toLocaleString()} audit events for auditors`);
}

/**
 * One-click auditor pack: platform security_events → Excel.
 * platform_admin only (RLS).
 */
export async function exportPlatformSecurityEvidence(opts?: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): Promise<void> {
  const { dateFrom = null, dateTo = null } = opts ?? {};

  let q = (supabase as any)
    .from("security_events")
    .select(
      "created_at, event_type, email, actor_user_id, org_id, entity_type, entity_id, summary, meta",
    )
    .order("created_at", { ascending: false })
    .limit(EXPORT_CAP);

  if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
  if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59.999`);

  const { data, error } = await q;
  if (error) throw error;

  const rows = ((data ?? []) as any[]).map((r) => ({
    timestamp_utc: fmtTs(r.created_at),
    event_type: r.event_type ?? "",
    email: r.email ?? "",
    actor_user_id: r.actor_user_id ?? "",
    org_id: r.org_id ?? "",
    entity_type: r.entity_type ?? "",
    entity_id: r.entity_id ?? "",
    summary: r.summary ?? "",
    meta: r.meta ? JSON.stringify(r.meta) : "",
  }));

  const capped = rows.length >= EXPORT_CAP;

  await writeObjectSheets(
    [
      {
        name: "Export_Metadata",
        headers: [...META_HEADERS],
        rows: metaRows({
          export_type: "platform_security_evidence",
          exported_at_utc: new Date().toISOString(),
          date_from: dateFrom ?? "(all)",
          date_to: dateTo ?? "(all)",
          row_count: String(rows.length),
          row_cap: String(EXPORT_CAP),
          note: capped
            ? "Export hit row cap — narrow the date range and export again for full coverage."
            : "Complete for selected filters.",
        }),
      },
      { name: "Security_Events", headers: [...SECURITY_HEADERS], rows },
    ],
    `iprojectx-security-evidence-${stamp()}.xlsx`,
  );

  logExport(`Exported ${rows.length} security events for auditors`, {
    export_type: "platform_security_evidence",
    row_count: rows.length,
    date_from: dateFrom,
    date_to: dateTo,
    capped,
  });

  toast.success(`Exported ${rows.length.toLocaleString()} security events for auditors`);
}
