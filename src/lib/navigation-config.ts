/**
 * Shared app navigation catalog + platform-configurable ordering.
 * Order/visibility live in landing_config.navigation (JSON) — no migration.
 */

export type NavItemDef = {
  to: string;
  label: string;
  exact?: boolean;
  adminOnly?: boolean;
  platformOnly?: boolean;
  /** Lucide icon key resolved in the shell */
  icon: string;
};

export type NavGroupDef = {
  heading: string;
  items: NavItemDef[];
};

export type NavigationConfig = {
  /** Ordered group headings. Unknown headings are appended. */
  group_order: string[];
  /** Per-group ordered item paths. Missing paths are appended; extras ignored. */
  item_order: Record<string, string[]>;
  /** Paths hidden from the sidebar (still reachable by URL if authorized). */
  hidden: string[];
};

export const DEFAULT_NAV_GROUPS: NavGroupDef[] = [
  {
    heading: "Command",
    items: [
      { to: "/app/", label: "Home", icon: "Home", exact: true },
      { to: "/app/my-work", label: "My Work", icon: "Briefcase" },
      { to: "/app/executive-cockpit", label: "Executive Cockpit", icon: "Rocket" },
      { to: "/app/executive", label: "Executive Dashboard", icon: "LayoutDashboard" },
      { to: "/app/ai-assist", label: "AI Assist", icon: "Sparkles" },
      { to: "/app/latest-updates", label: "Latest Updates", icon: "Bell" },
      { to: "/app/about", label: "About", icon: "Info" },
    ],
  },
  {
    heading: "Portfolio",
    items: [
      { to: "/app/projects", label: "Projects", icon: "FolderKanban" },
      { to: "/app/programs", label: "Programs", icon: "Layers" },
      { to: "/app/project-infographic", label: "Project Infographic", icon: "Image" },
      { to: "/app/portfolio-segmentation", label: "Segmentation", icon: "PieChart" },
      { to: "/app/prioritisation", label: "Prioritisation", icon: "Trophy" },
      { to: "/app/portfolio-movements", label: "Movements", icon: "ArrowLeftRight" },
      { to: "/app/demand-pipeline", label: "Demand Pipeline", icon: "Inbox" },
      { to: "/app/scenarios", label: "Portfolio Scenarios", icon: "Scale" },
    ],
  },
  {
    heading: "Delivery",
    items: [
      { to: "/app/work-items", label: "Work Items", icon: "ListTodo" },
      { to: "/app/timeline", label: "Timeline", icon: "Calendar" },
      { to: "/app/roadmap-governance", label: "Roadmap × Governance", icon: "Map" },
      { to: "/app/roadmap-analytics", label: "Roadmap Analytics", icon: "TrendingUp" },
      { to: "/app/stage-gates", label: "Stage Gates (Waterfall)", icon: "Flag" },
      { to: "/app/agile", label: "Agile / Sprints", icon: "Zap" },
      { to: "/app/governance-channels", label: "Governance Channel", icon: "Radio" },
      { to: "/app/dependencies", label: "Dependencies", icon: "GitBranch" },
      { to: "/app/resources", label: "Resources", icon: "Users" },
      { to: "/app/risk-roadmap", label: "Risk Roadmap", icon: "Route" },
    ],
  },
  {
    heading: "Financials",
    items: [
      { to: "/app/financials", label: "Financials", icon: "DollarSign" },
      { to: "/app/fy-allocation", label: "FY Allocation", icon: "Wallet" },
      { to: "/app/phase-financials", label: "Phase Financials", icon: "Clock" },
      { to: "/app/cost-vs-benefit", label: "Cost vs Benefit", icon: "Scale" },
      { to: "/app/benefits", label: "Benefits", icon: "Award" },
    ],
  },
  {
    heading: "Governance",
    items: [
      { to: "/app/risks", label: "Risks", icon: "AlertTriangle" },
      { to: "/app/issues", label: "Issues", icon: "AlertTriangle" },
      { to: "/app/decisions", label: "Decisions", icon: "Gavel" },
      { to: "/app/actions", label: "Actions", icon: "ListChecks" },
      { to: "/app/stakeholders", label: "Stakeholders", icon: "CircleUser" },
      { to: "/app/lessons", label: "Lessons Learned", icon: "BookOpen" },
      { to: "/app/release-register", label: "Release Register", icon: "Package" },
      { to: "/app/executive-reports", label: "Executive Reports", icon: "FileBarChart" },
      { to: "/app/audit-log", label: "Audit Log", icon: "FileText" },
      { to: "/app/data-editor", label: "Data Editor", icon: "Table2" },
      { to: "/app/configuration", label: "Configuration", icon: "Settings" },
      { to: "/app/navigation", label: "Navigation sequence", icon: "Menu", adminOnly: true },
      { to: "/app/billing", label: "Billing & Invoices", icon: "Receipt", adminOnly: true },
      { to: "/app/team", label: "Admin: Users", icon: "ShieldCheck", adminOnly: true },
      { to: "/app/permissions", label: "Admin: Permissions", icon: "ShieldCheck", adminOnly: true },
    ],
  },
  {
    heading: "Platform",
    items: [
      {
        to: "/platform/settings",
        label: "Settings · Nav & Experience",
        icon: "Settings",
        platformOnly: true,
      },
      { to: "/platform/landing", label: "Landing Page", icon: "Palette", platformOnly: true },
      {
        to: "/platform/organizations",
        label: "Organizations & Users",
        icon: "Building2",
        platformOnly: true,
      },
      { to: "/platform/finance", label: "Finance & P&L", icon: "TrendingUp", platformOnly: true },
      { to: "/platform/invoices", label: "All Invoices", icon: "Receipt", platformOnly: true },
      {
        to: "/platform/invoice-template",
        label: "Invoice Template",
        icon: "FileText",
        platformOnly: true,
      },
      {
        to: "/platform/subscriptions",
        label: "Customer Subs",
        icon: "Building2",
        platformOnly: true,
      },
      { to: "/platform/plans", label: "Plans", icon: "CreditCard", platformOnly: true },
      {
        to: "/platform/limits",
        label: "Plan Limits & Usage",
        icon: "ShieldCheck",
        platformOnly: true,
      },
      { to: "/platform/expenses", label: "Expenses", icon: "Landmark", platformOnly: true },
      {
        to: "/platform/branding",
        label: "Branding & White Label",
        icon: "Palette",
        platformOnly: true,
      },
    ],
  },
];

export function defaultNavigationConfig(
  catalog: NavGroupDef[] = DEFAULT_NAV_GROUPS,
): NavigationConfig {
  return {
    group_order: catalog.map((g) => g.heading),
    item_order: Object.fromEntries(catalog.map((g) => [g.heading, g.items.map((i) => i.to)])),
    hidden: [],
  };
}

/** App workspace groups only (no Platform admin section). */
export const APP_NAV_GROUPS: NavGroupDef[] = DEFAULT_NAV_GROUPS.filter(
  (g) => g.heading !== "Platform",
);

export function defaultAppNavigationConfig(): NavigationConfig {
  return defaultNavigationConfig(APP_NAV_GROUPS);
}

export function mergeNavigationConfig(
  partial: any,
  catalog: NavGroupDef[] = DEFAULT_NAV_GROUPS,
): NavigationConfig {
  const base = defaultNavigationConfig(catalog);
  if (!partial || typeof partial !== "object") return base;

  const group_order = Array.isArray(partial.group_order)
    ? partial.group_order.map(String).filter(Boolean)
    : base.group_order;

  const item_order: Record<string, string[]> = { ...base.item_order };
  if (partial.item_order && typeof partial.item_order === "object") {
    for (const [k, v] of Object.entries(partial.item_order)) {
      if (Array.isArray(v)) item_order[k] = (v as unknown[]).map(String);
    }
  }

  const hidden = Array.isArray(partial.hidden)
    ? partial.hidden.map(String).filter(Boolean)
    : [];

  return { group_order, item_order, hidden };
}

function orderByKeys<T extends { to?: string; heading?: string }>(
  items: T[],
  order: string[],
  keyFn: (t: T) => string,
): T[] {
  const map = new Map(items.map((i) => [keyFn(i), i]));
  const out: T[] = [];
  for (const k of order) {
    const hit = map.get(k);
    if (hit) {
      out.push(hit);
      map.delete(k);
    }
  }
  for (const rest of map.values()) out.push(rest);
  return out;
}

/** Apply navigation sequence + hidden flags onto a catalog. */
export function applyNavigationConfig(
  config: NavigationConfig | null | undefined,
  catalog: NavGroupDef[] = DEFAULT_NAV_GROUPS,
): NavGroupDef[] {
  const nav = mergeNavigationConfig(config, catalog);
  const hidden = new Set(nav.hidden);

  const groups = orderByKeys(catalog, nav.group_order, (g) => g.heading).map((group) => {
    const itemOrder = nav.item_order[group.heading] ?? group.items.map((i) => i.to);
    const items = orderByKeys(group.items, itemOrder, (i) => i.to!).filter(
      (i) => !hidden.has(i.to),
    );
    return { ...group, items };
  });

  return groups.filter((g) => g.items.length > 0);
}

/**
 * Platform config as base; when org has a custom navigation blob, it overrides
 * app groups. Platform section always comes from platform config.
 */
export function resolveCombinedNavigation(
  platformConfig: NavigationConfig | null | undefined,
  orgConfig: NavigationConfig | null | undefined,
): NavGroupDef[] {
  const platformApplied = applyNavigationConfig(platformConfig, DEFAULT_NAV_GROUPS);
  const platformSection = platformApplied.filter((g) => g.heading === "Platform");

  if (!orgConfig) {
    return platformApplied;
  }

  const appPart = applyNavigationConfig(orgConfig, APP_NAV_GROUPS);
  return [...appPart, ...platformSection];
}

export function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return next;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}
