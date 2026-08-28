import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canEditProjects, useAuth, type AppRole } from "@/lib/auth-context";
import {
  ADMIN_ONLY_PAGES,
  PAGES,
  capabilityKey,
  pageKey,
  resolveCanViewPage,
} from "@/lib/permissions-acl";

export {
  ADMIN_ONLY_PAGES,
  PAGES,
  capabilityKey,
  pageKey,
  resolveCanViewPage,
};

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
    description:
      "Upload Excel workbooks on Data Editor and import project templates (Edit or Other).",
  },
  {
    id: "timesheet_cost_view",
    label: "Timesheet / resource cost view",
    description:
      "View FTE labor cost (Cost quick view, Org reporting) and access Resource setup rates. Tick View. Default: Org Admin + Project Manager.",
  },
];

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

/** Same roles as demand_pipeline RLS (admin / org_admin / pm / bu_lead). */
function isDemandPipelineWriter(roles: string[]) {
  return canEditProjects(roles as AppRole[]);
}

/** Default matrix flags when the org has not saved a row for this table+role. */
export function defaultTableFlags(tableName: string, roles: string[]): PermFlags {
  const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");
  if (isAdmin) return emptyFlags(true, true);
  const pmish = canEditProjects(roles as AppRole[]);
  const defaultEdit =
    tableName === "projects" ||
    tableName === "project_streams" ||
    tableName === "decisions" ||
    tableName === "demand_pipeline"
      ? pmish
      : false;
  return emptyFlags(defaultEdit, false);
}

/** Returns { canView, canEdit, canOther } for the current user for a given table. */
export function useTablePermission(tableName: string) {
  const { roles } = useAuth();
  const { data: rows = [] } = useRolePermissions();
  const relevant = rows.filter((r) => roles.includes(r.role as any) && r.table_name === tableName);
  const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");
  const pipelineWriter = tableName === "demand_pipeline" && isDemandPipelineWriter(roles);
  if (relevant.length === 0) {
    // Unconfigured matrix: admins edit everything; PMs keep project-page edit (legacy).
    const defaults = defaultTableFlags(tableName, roles);
    return {
      canView: defaults.can_view,
      canEdit: defaults.can_edit,
      canOther: defaults.can_other || isAdmin,
    };
  }
  // Pipeline writers keep register edit even if a saved matrix omitted/denied the table —
  // RLS already allows admin / PM / BU lead to write demand_pipeline.
  return {
    canView: relevant.some((r) => r.can_view) || pipelineWriter,
    canEdit: relevant.some((r) => r.can_edit) || pipelineWriter,
    canOther: relevant.some((r) => r.can_other) || isAdmin || pipelineWriter,
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
