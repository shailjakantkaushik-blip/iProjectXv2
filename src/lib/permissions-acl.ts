/** Pure page ACL — no React or Supabase. Safe for Node tests. */

export const PAGES: { path: string; label: string; group: string }[] = [
  { path: "/app/my-work", label: "My Work", group: "Command Center" },
  { path: "/app/strategic-alignment", label: "Strategic Alignment", group: "Command Center" },
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
  { path: "/app/investment-committee", label: "Investment Committee", group: "Delivery" },
  { path: "/app/dependencies", label: "Dependencies", group: "Delivery" },
  { path: "/app/schedule-cpm", label: "Schedule CPM", group: "Delivery" },
  { path: "/app/resources", label: "Resources", group: "Delivery" },
  { path: "/app/timesheets", label: "Timesheets", group: "Delivery" },
  { path: "/app/risk-roadmap", label: "Risk Roadmap", group: "Delivery" },
  { path: "/app/financials", label: "Financials", group: "Financials" },
  { path: "/app/how-money-works", label: "How money works", group: "Financials" },
  { path: "/app/fy-allocation", label: "FY Allocation", group: "Financials" },
  { path: "/app/budget-vs-plan", label: "Budget vs Plan", group: "Financials" },
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

export function capabilityKey(id: string) {
  return `capability::${id}`;
}

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
  const platform = roles.includes("platform_admin");
  if (ADMIN_ONLY_PAGES.has(path)) {
    if (path === "/app/permissions") return admin || platform;
    return admin;
  }
  if (admin) return true;
  const relevant = rows.filter((r) => roles.includes(r.role) && r.table_name === pageKey(path));
  if (relevant.length === 0) return false;
  return relevant.some((r) => r.can_view);
}
