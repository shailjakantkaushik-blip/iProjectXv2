import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const EDITABLE_TABLES: { name: string; label: string }[] = [
  { name: "projects", label: "Projects" },
  { name: "milestones", label: "Milestones" },
  { name: "stage_gates", label: "Stage Gates" },
  { name: "risks", label: "Risks" },
  { name: "issues", label: "Issues" },
  { name: "actions", label: "Actions" },
  { name: "decisions", label: "Decisions" },
  { name: "benefits", label: "Benefits" },
  { name: "financials_monthly", label: "Financials (monthly)" },
  { name: "fy_allocations", label: "FY Allocations" },
  { name: "dependencies", label: "Dependencies" },
  { name: "sprints", label: "Sprints" },
  { name: "resource_allocations", label: "Resource Allocations" },
  { name: "resources", label: "Resources" },
  { name: "change_requests", label: "Change Requests" },
  { name: "demand_pipeline", label: "Demand Pipeline" },
  { name: "status_updates", label: "Status Updates" },
  { name: "stakeholders", label: "Stakeholders" },
  { name: "lessons_learned", label: "Lessons Learned" },
  { name: "portfolio_scenarios", label: "Portfolio Scenarios" },
];

// Page-level access control. Stored in role_table_permissions using
// table_name = `page::<path>`. Admin/org_admin bypass these checks.
export const PAGES: { path: string; label: string; group: string }[] = [
  { path: "/app/my-work", label: "My Work", group: "Command" },
  { path: "/app/executive-cockpit", label: "Executive Cockpit", group: "Command" },
  { path: "/app/executive", label: "Executive Dashboard", group: "Command" },
  { path: "/app/ai-assist", label: "AI Assist", group: "Command" },
  { path: "/app/latest-updates", label: "Latest Updates", group: "Command" },
  { path: "/app/about", label: "About", group: "Command" },
  { path: "/app/projects", label: "Projects", group: "Portfolio" },
  { path: "/app/programs", label: "Programs", group: "Portfolio" },
  { path: "/app/project-infographic", label: "Project Infographic", group: "Portfolio" },
  { path: "/app/portfolio-segmentation", label: "Segmentation", group: "Portfolio" },
  { path: "/app/prioritisation", label: "Prioritisation", group: "Portfolio" },
  { path: "/app/portfolio-movements", label: "Movements", group: "Portfolio" },
  { path: "/app/demand-pipeline", label: "Demand Pipeline", group: "Portfolio" },
  { path: "/app/scenarios", label: "Portfolio Scenarios", group: "Portfolio" },
  { path: "/app/work-items", label: "Work Items", group: "Delivery" },
  { path: "/app/timeline", label: "Timeline", group: "Delivery" },
  { path: "/app/roadmap-governance", label: "Roadmap × Governance", group: "Delivery" },
  { path: "/app/roadmap-analytics", label: "Roadmap Analytics", group: "Delivery" },
  { path: "/app/stage-gates", label: "Stage Gates (Waterfall)", group: "Delivery" },
  { path: "/app/agile", label: "Agile / Sprints", group: "Delivery" },
  { path: "/app/governance-channels", label: "Governance Channel", group: "Delivery" },
  { path: "/app/dependencies", label: "Dependencies", group: "Delivery" },
  { path: "/app/resources", label: "Resources", group: "Delivery" },
  { path: "/app/risk-roadmap", label: "Risk Roadmap", group: "Delivery" },
  { path: "/app/financials", label: "Financials", group: "Financials" },
  { path: "/app/fy-allocation", label: "FY Allocation", group: "Financials" },
  { path: "/app/phase-financials", label: "Phase Financials", group: "Financials" },
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
  { path: "/app/audit-log", label: "Audit Log", group: "Governance" },
  { path: "/app/data-editor", label: "Data Editor", group: "Governance" },
  { path: "/app/configuration", label: "Configuration", group: "Governance" },
  { path: "/app/navigation", label: "Navigation sequence", group: "Governance" },
];

export const ADMIN_ONLY_PAGES = new Set<string>([
  "/app/billing",
  "/app/team",
  "/app/permissions",
]);

export function pageKey(path: string) {
  return `page::${path}`;
}

export function useAllowedPages(): { isReady: boolean; canView: (path: string) => boolean } {
  const { roles } = useAuth();
  const { data: rows = [], isSuccess } = useRolePermissions();
  const admin = roles.some((r) => r === "admin" || r === "org_admin");
  const canView = (path: string) => {
    if (ADMIN_ONLY_PAGES.has(path)) return admin;
    if (admin) return true;
    const relevant = rows.filter((r) => roles.includes(r.role as any) && r.table_name === pageKey(path));
    if (relevant.length === 0) return true; // default visible when unconfigured
    return relevant.some((r) => r.can_view);
  };
  return { isReady: isSuccess || roles.length === 0, canView };
}

type Row = { role: string; table_name: string; can_view: boolean; can_edit: boolean };

export function useRolePermissions() {
  const { organization } = useAuth();
  return useQuery({
    queryKey: ["role_table_permissions", organization?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("role_table_permissions")
        .select("role,table_name,can_view,can_edit")
        .eq("org_id", organization!.id);
      return (data ?? []) as Row[];
    },
    enabled: !!organization,
    staleTime: 60_000,
  });
}

/** Returns { canView, canEdit } for the current user for a given table. */
export function useTablePermission(tableName: string) {
  const { roles } = useAuth();
  const { data: rows = [] } = useRolePermissions();
  const relevant = rows.filter((r) => roles.includes(r.role as any) && r.table_name === tableName);
  if (relevant.length === 0) {
    // If admin roles exist but no rows yet, default to edit for admins.
    const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");
    return { canView: true, canEdit: isAdmin };
  }
  return {
    canView: relevant.some((r) => r.can_view),
    canEdit: relevant.some((r) => r.can_edit),
  };
}
