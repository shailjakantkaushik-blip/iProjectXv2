/**
 * Control-plane vs tenant-plane table split for optional BYOD.
 *
 * Control plane always stays on the shared iProjectX database (auth, orgs,
 * billing, branding, BYOD secrets, support, legal, security audit).
 * Tenant business data is proxied to the customer DB when byod_active.
 *
 * Default for unknown tables: control (stay on platform) — safer than
 * accidentally sending platform secrets or cross-tenant config to a customer API.
 */

/** Always platform — never rewrite browser REST to the BYOD proxy. */
export const BYOD_CONTROL_TABLES = new Set<string>([
  "organizations",
  "profiles",
  "user_roles",
  "role_table_permissions",
  "role_project_visibility",
  "user_role_project_visibility",
  "billing_plans",
  "subscriptions",
  "invoices",
  "invoice_payments",
  "invoice_template_config",
  "platform_expenses",
  "landing_config",
  "legal_policies",
  "org_byod_connections",
  "org_license_certificates",
  "org_support_settings",
  "org_sso_config",
  "notifications",
  "security_events",
  "audit_events",
  "audit_log",
  "support_tickets",
  "support_ticket_comments",
  "eoi_requests",
]);

/**
 * Tenant portfolio / delivery / finance tables.
 * When BYOD is active, browser `/rest/v1/{table}` is rewritten to same-origin proxy.
 */
export const BYOD_TENANT_TABLES = new Set<string>([
  "projects",
  "project_streams",
  "business_units",
  "stage_gate_definitions",
  "stage_gates",
  "stage_gate_checklist_items",
  "stage_gate_checklist_responses",
  "milestones",
  "risks",
  "issues",
  "actions",
  "decisions",
  "change_requests",
  "dependencies",
  "benefits",
  "documents",
  "lessons_learned",
  "stakeholders",
  "financials_monthly",
  "fy_allocations",
  "opex_labor_planned",
  "opex_other_costs",
  "resources",
  "resource_allocations",
  "sprints",
  "work_items",
  "work_item_links",
  "work_item_resource_assignees",
  "timesheets",
  "timesheet_entries",
  "timesheet_approvals",
  "demand_pipeline",
  "portfolio_scenarios",
  "scenario_projects",
  "status_updates",
  "governance_channels",
  "entity_comments",
  "report_definitions",
]);

/** Tenant tables that carry org_id — proxy forces org scope (service role bypasses RLS). */
export const BYOD_ORG_SCOPED_TABLES = new Set<string>([
  ...BYOD_TENANT_TABLES,
]);

export function isByodControlTable(name: string): boolean {
  return BYOD_CONTROL_TABLES.has(name);
}

export function isByodTenantTable(name: string): boolean {
  if (BYOD_CONTROL_TABLES.has(name)) return false;
  return BYOD_TENANT_TABLES.has(name);
}

/** Extract PostgREST resource name from `/rest/v1/{table}` or `/rest/v1/rpc/{fn}`. */
export function parseRestV1Resource(pathname: string): {
  kind: "table" | "rpc" | "other";
  name: string;
} | null {
  const m = pathname.match(/\/rest\/v1\/(.+)$/);
  if (!m) return null;
  const rest = m[1].replace(/\/+$/, "");
  if (!rest) return null;
  if (rest.startsWith("rpc/")) {
    const fn = rest.slice(4).split("/")[0] ?? "";
    return fn ? { kind: "rpc", name: fn } : null;
  }
  const table = rest.split("/")[0] ?? "";
  if (!table || table.includes(".")) return { kind: "other", name: table };
  return { kind: "table", name: table };
}
