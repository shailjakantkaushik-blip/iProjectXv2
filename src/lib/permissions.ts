import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canEditProjects, useAuth } from "@/lib/auth-context";

export const EDITABLE_TABLES: { name: string; label: string }[] = [
  { name: "projects", label: "Projects" },
  { name: "project_streams", label: "Project Streams" },
  { name: "milestones", label: "Milestones" },
  { name: "stage_gates", label: "Stage Gates" },
  { name: "risks", label: "Risks" },
  { name: "issues", label: "Issues" },
  { name: "actions", label: "Actions" },
  { name: "decisions", label: "Decisions" },
  { name: "benefits", label: "Benefits" },
  { name: "financials_monthly", label: "Financials (monthly)" },
  { name: "opex_other_costs", label: "Other OpEx Costs" },
  { name: "fy_allocations", label: "FY Allocations" },
  { name: "dependencies", label: "Dependencies" },
  { name: "sprints", label: "Sprints" },
  { name: "resource_allocations", label: "Resource Allocations" },
  { name: "resources", label: "Resources" },
  { name: "change_requests", label: "Release Register" },
  { name: "demand_pipeline", label: "Demand Pipeline" },
  { name: "stage_gate_checklist_items", label: "Gate Checklist Templates" },
  { name: "custom_reports", label: "Custom Reports" },
  { name: "status_updates", label: "Status Updates" },
  { name: "stakeholders", label: "Stakeholders" },
  { name: "lessons_learned", label: "Lessons Learned" },
  { name: "portfolio_scenarios", label: "Portfolio Scenarios" },
];

/** Capability keys stored as role_table_permissions.table_name = capability::<id> */
export const CAPABILITIES: {
  id: string;
  label: string;
  description: string;
}[] = [
  {
    id: "data_editor",
    label: "Data Editor changes",
    description: "Edit rows in Data Editor (inline cells). Other = add/delete rows.",
  },
  {
    id: "template_upload",
    label: "Upload template / workbook",
    description: "Upload Excel workbooks on Data Editor and import project templates (Edit or Other).",
  },
  {
    id: "timesheet_cost_view",
    label: "Timesheet / resource cost view",
    description:
      "View FTE labor cost (Cost quick view, Org reporting) and access Resource setup rates. Tick View. Default: Org Admin + Project Manager.",
  },
];

export function capabilityKey(id: string) {
  return `capability::${id}`;
}

// Page-level access control. Stored in role_table_permissions using
// table_name = `page::<path>`. Admin/org_admin bypass these checks.
export const PAGES: { path: string; label: string; group: string }[] = [
  { path: "/app/my-work", label: "My Work", group: "Command Center" },
  { path: "/app/portfolio-pulse", label: "Portfolio Pulse", group: "Command Center" },
  { path: "/app/executive-cockpit", label: "Executive Cockpit", group: "Command Center" },
  { path: "/app/executive", label: "Executive Dashboard", group: "Command Center" },
  { path: "/app/executive-intelligence", label: "Executive Intelligence", group: "Command Center" },
  { path: "/app/ai-assist", label: "In-house AI", group: "Command Center" },
  { path: "/app/latest-updates", label: "Latest Updates", group: "Command Center" },
  { path: "/app/support", label: "Support", group: "Command Center" },
  { path: "/app/about", label: "About", group: "Command Center" },
  { path: "/app/projects", label: "Projects", group: "Project Arena" },
  { path: "/app/programs", label: "Programs", group: "Project Arena" },
  { path: "/app/project-infographic", label: "Project Infographic", group: "Project Arena" },
  { path: "/app/project-forecast", label: "Project Estimation Planning", group: "Project Arena" },
  { path: "/app/portfolio-segmentation", label: "Segmentation", group: "Project Arena" },
  { path: "/app/prioritisation", label: "Prioritisation", group: "Project Arena" },
  { path: "/app/portfolio-movements", label: "Movements", group: "Project Arena" },
  { path: "/app/demand-pipeline", label: "Demand Pipeline", group: "Project Arena" },
  { path: "/app/scenarios", label: "Alignment Scenarios", group: "Project Arena" },
  { path: "/app/work-items", label: "Work Items", group: "Delivery" },
  { path: "/app/work-board", label: "Work Board", group: "Delivery" },
  { path: "/app/timeline", label: "Timeline", group: "Delivery" },
  { path: "/app/roadmap-governance", label: "Roadmap × Governance", group: "Delivery" },
  { path: "/app/roadmap-analytics", label: "Roadmap Analytics", group: "Delivery" },
  { path: "/app/stage-gates", label: "Stage Gates (Waterfall)", group: "Delivery" },
  { path: "/app/stage-gate-config", label: "Delivery Methods & Gates", group: "Org Admin" },
  { path: "/app/agile", label: "Agile / Sprints", group: "Delivery" },
  { path: "/app/governance-channels", label: "Governance Channel", group: "Delivery" },
  { path: "/app/dependencies", label: "Dependencies", group: "Delivery" },
  { path: "/app/schedule-cpm", label: "Schedule CPM", group: "Delivery" },
  { path: "/app/resources", label: "Resources", group: "Delivery" },
  { path: "/app/timesheets", label: "Timesheets", group: "Delivery" },
  { path: "/app/risk-roadmap", label: "Risk Roadmap", group: "Delivery" },
  { path: "/app/financials", label: "Financials", group: "Financials" },
  { path: "/app/how-money-works", label: "How money works", group: "Financials" },
  { path: "/app/fy-allocation", label: "FY Allocation", group: "Financials" },
  { path: "/app/phase-financials", label: "Phase Financials", group: "Financials" },
  { path: "/app/evm", label: "Earned Value (EVM)", group: "Financials" },
  { path: "/app/cost-vs-benefit", label: "Cost vs Benefit", group: "Financials" },
  { path: "/app/benefits", label: "Benefits", group: "Financials" },
  { path: "/app/risks", label: "Risks", group: "Governance" },
  { path: "/app/issues", label: "Issues", group: "Governance" },
  { path: "/app/decisions", label: "Decisions", group: "Governance" },
  { path: "/app/actions", label: "Actions", group: "Governance" },
  { path: "/app/stakeholders", label: "Stakeholders", group: "Governance" },
  { path: "/app/lessons", label: "Lessons Learned", group: "Governance" },
  { path: "/app/release-register", label: "Release Register", group: "Governance" },
  { path: "/app/executive-reports", label: "Executive Reports", group: "Governance" },
  { path: "/app/report-builder", label: "Report Builder", group: "Governance" },
  { path: "/app/audit-log", label: "Audit Log", group: "Governance" },
  { path: "/app/data-editor", label: "Data Editor", group: "Governance" },
  { path: "/app/configuration", label: "Configuration", group: "Org Admin" },
  { path: "/app/integrations", label: "Integrations", group: "Org Admin" },
  { path: "/app/navigation", label: "Navigation sequence", group: "Org Admin" },
  { path: "/app/page-downloads", label: "Page downloads", group: "Org Admin" },
  { path: "/app/project-access", label: "Project data access", group: "Org Admin" },
  { path: "/app/alert-emails", label: "Outbound alert emails", group: "Org Admin" },
];

export const ADMIN_ONLY_PAGES = new Set<string>([
  "/app/billing",
  "/app/team",
  "/app/permissions",
  "/app/project-access",
  "/app/alert-emails",
  "/app/configuration",
  "/app/integrations",
  "/app/navigation",
  "/app/page-downloads",
  "/app/audit-log",
]);

export function pageKey(path: string) {
  return `page::${path}`;
}

/** Pure page ACL check — shared by UI hook and server In-house AI. */
export function resolveCanViewPage(
  path: string,
  roles: string[],
  rows: Array<{ role: string; table_name: string; can_view: boolean }>,
): boolean {
  const admin = roles.some((r) => r === "admin" || r === "org_admin");
  if (ADMIN_ONLY_PAGES.has(path)) return admin;
  if (admin) return true;
  const relevant = rows.filter((r) => roles.includes(r.role) && r.table_name === pageKey(path));
  // Default-deny when the matrix has no row for this role+page (fail closed).
  // Seed page::* rows via Permissions UI or org onboarding for intended access.
  if (relevant.length === 0) return false;
  return relevant.some((r) => r.can_view);
}

export function useAllowedPages(): { isReady: boolean; canView: (path: string) => boolean } {
  const { roles } = useAuth();
  const { data: rows = [], isSuccess } = useRolePermissions();
  const canView = (path: string) => resolveCanViewPage(path, roles, rows);
  return { isReady: isSuccess || roles.length === 0, canView };
}

type PermFlags = { can_view: boolean; can_edit: boolean; can_other: boolean };
type Row = { role: string; table_name: string } & PermFlags;

export function useRolePermissions() {
  const { organization } = useAuth();
  return useQuery({
    queryKey: ["role_table_permissions", organization?.id],
    queryFn: async () => {
      const full = await (supabase as any)
        .from("role_table_permissions")
        .select("role,table_name,can_view,can_edit,can_other")
        .eq("org_id", organization!.id);
      if (!full.error) return (full.data ?? []) as Row[];
      const { data } = await (supabase as any)
        .from("role_table_permissions")
        .select("role,table_name,can_view,can_edit")
        .eq("org_id", organization!.id);
      return ((data ?? []) as Array<Omit<Row, "can_other">>).map((r) => ({
        ...r,
        can_other: false,
      }));
    },
    enabled: !!organization,
    staleTime: 60_000,
  });
}

function emptyFlags(canEdit: boolean, canOther = canEdit): PermFlags {
  return { can_view: true, can_edit: canEdit, can_other: canOther };
}

/** Returns { canView, canEdit, canOther } for the current user for a given table. */
export function useTablePermission(tableName: string) {
  const { roles } = useAuth();
  const { data: rows = [] } = useRolePermissions();
  const relevant = rows.filter((r) => roles.includes(r.role as any) && r.table_name === tableName);
  const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");
  if (relevant.length === 0) {
    // Unconfigured matrix: admins edit everything; PMs keep project-page edit (legacy).
    const pmish = canEditProjects(roles);
    const defaultEdit =
      tableName === "projects" || tableName === "project_streams" || tableName === "decisions"
        ? pmish
        : isAdmin;
    return { canView: true, canEdit: defaultEdit, canOther: isAdmin };
  }
  return {
    canView: relevant.some((r) => r.can_view),
    canEdit: relevant.some((r) => r.can_edit),
    canOther: relevant.some((r) => r.can_other),
  };
}

/**
 * Org-admin-configurable capabilities (Data Editor, template upload, …).
 * Stored as capability::<id> in role_table_permissions.
 * View / Edit / Other map to can_view / can_edit / can_other.
 * Default when unconfigured: see defaultCapabilityFlags().
 */
export function defaultCapabilityAllowed(capabilityId: string, roles: string[]): boolean {
  const flags = defaultCapabilityFlags(capabilityId, roles);
  return flags.can_view || flags.can_edit || flags.can_other;
}

export function defaultCapabilityFlags(capabilityId: string, roles: string[]): PermFlags {
  const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");
  if (isAdmin) return emptyFlags(true, true);
  if (capabilityId === "timesheet_cost_view") {
    const allowed = roles.includes("pm");
    return { can_view: allowed, can_edit: false, can_other: false };
  }
  return { can_view: false, can_edit: false, can_other: false };
}

export function useCapabilityPermission(capabilityId: string): {
  canView: boolean;
  canEdit: boolean;
  canOther: boolean;
  isReady: boolean;
} {
  const { roles } = useAuth();
  const { data: rows = [], isSuccess } = useRolePermissions();
  const key = capabilityKey(capabilityId);
  const relevant = rows.filter((r) => roles.includes(r.role as any) && r.table_name === key);
  const isReady = isSuccess || roles.length === 0;
  if (relevant.length === 0) {
    const flags = defaultCapabilityFlags(capabilityId, roles);
    return {
      canView: flags.can_view,
      canEdit: flags.can_edit,
      canOther: flags.can_other,
      isReady,
    };
  }
  return {
    canView: relevant.some((r) => r.can_view),
    canEdit: relevant.some((r) => r.can_edit),
    canOther: relevant.some((r) => r.can_other),
    isReady,
  };
}
