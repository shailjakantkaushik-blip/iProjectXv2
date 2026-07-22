/**
 * Shared app navigation catalog + platform-configurable ordering / structure.
 * Order/visibility/section layout live in landing_config.navigation (JSON).
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
  /** Ordered group headings (built-in or custom). */
  group_order: string[];
  /** Per-group ordered item paths. Items may move across groups. */
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
    ],
  },
  {
    heading: "Org Admin",
    items: [
      { to: "/app/configuration", label: "Configuration", icon: "Settings", adminOnly: true },
      { to: "/app/navigation", label: "Navigation sequence", icon: "Menu", adminOnly: true },
      { to: "/app/project-access", label: "Project data access", icon: "Eye", adminOnly: true },
      {
        to: "/app/project-purge",
        label: "Closed project purge",
        icon: "Trash2",
        adminOnly: true,
      },
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
      {
        to: "/platform/project-purge",
        label: "Closed project purge",
        icon: "Trash2",
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

export function flattenNavItems(catalog: NavGroupDef[]): Map<string, NavItemDef> {
  const map = new Map<string, NavItemDef>();
  for (const g of catalog) {
    for (const i of g.items) map.set(i.to, i);
  }
  return map;
}

export function defaultItemHome(catalog: NavGroupDef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of catalog) {
    for (const i of g.items) map.set(i.to, g.heading);
  }
  return map;
}

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

  const catalogHeadings = new Set(catalog.map((g) => g.heading));
  const allPaths = new Set(flattenNavItems(catalog).keys());

  const allowPlatform = catalogHeadings.has("Platform");

  let group_order: string[];
  if (Array.isArray(partial.group_order) && partial.group_order.length > 0) {
    group_order = (partial.group_order as unknown[])
      .map(String)
      .filter(Boolean)
      // Org catalogs must never inherit the Platform section from platform defaults
      .filter((h: string) => allowPlatform || h !== "Platform");
    // Keep any new catalog headings that were added in code after config was saved
    for (const h of catalog.map((g) => g.heading)) {
      if (!group_order.includes(h)) group_order.push(h);
    }
  } else {
    group_order = [...base.group_order];
  }

  const item_order: Record<string, string[]> = {};
  // Seed from partial first (preserves custom placement — never steal these later)
  const explicitlyPlaced = new Set<string>();
  if (partial.item_order && typeof partial.item_order === "object") {
    for (const [k, v] of Object.entries(partial.item_order)) {
      if (!allowPlatform && k === "Platform") continue;
      if (Array.isArray(v)) {
        const paths = (v as unknown[]).map(String).filter((p) => allPaths.has(p));
        item_order[k] = paths;
        for (const p of paths) explicitlyPlaced.add(p);
      }
    }
  }

  // Ensure every group_order heading has an array.
  // Missing groups only receive default items that are not already placed
  // elsewhere — never pull items out of a saved custom section (this was
  // causing Admin Users / Permissions / Billing to jump back under Governance).
  for (const h of group_order) {
    if (!item_order[h]) {
      const seeded = (base.item_order[h] ?? []).filter((p) => !explicitlyPlaced.has(p));
      item_order[h] = seeded;
      for (const p of seeded) explicitlyPlaced.add(p);
    }
  }

  // Deduplicate: first group in group_order that lists a path wins.
  const seenPath = new Set<string>();
  for (const h of group_order) {
    const paths = item_order[h] ?? [];
    const next: string[] = [];
    for (const p of paths) {
      if (seenPath.has(p)) continue;
      seenPath.add(p);
      next.push(p);
    }
    item_order[h] = next;
  }

  // Place any catalog paths that are missing from all groups into their default home
  const assigned = new Set<string>(seenPath);
  const homes = defaultItemHome(catalog);
  for (const path of allPaths) {
    if (assigned.has(path)) continue;
    const home = homes.get(path) ?? group_order[0];
    if (!home) continue;
    if (!item_order[home]) item_order[home] = [];
    if (!group_order.includes(home) && catalogHeadings.has(home)) {
      group_order.push(home);
    }
    if (item_order[home]) item_order[home].push(path);
    assigned.add(path);
  }

  const hidden = Array.isArray(partial.hidden)
    ? (partial.hidden as unknown[])
        .map(String)
        .filter((p: string) => allPaths.has(p))
    : [];

  // Final scrub: never keep Platform (or its paths) when the catalog excludes it
  if (!allowPlatform) {
    group_order = group_order.filter((h) => h !== "Platform");
    delete item_order["Platform"];
  }

  return { group_order, item_order, hidden };
}

/** Keep only workspace sections/items (drops Platform for org-admin editors). */
export function scopeNavigationToCatalog(
  config: NavigationConfig,
  catalog: NavGroupDef[] = APP_NAV_GROUPS,
): NavigationConfig {
  return mergeNavigationConfig(config, catalog);
}

/** Apply navigation sequence + hidden flags onto a catalog (supports custom sections). */
export function applyNavigationConfig(
  config: NavigationConfig | null | undefined,
  catalog: NavGroupDef[] = DEFAULT_NAV_GROUPS,
): NavGroupDef[] {
  const nav = mergeNavigationConfig(config, catalog);
  const allItems = flattenNavItems(catalog);
  const hidden = new Set(nav.hidden);
  const used = new Set<string>();

  const groups: NavGroupDef[] = [];
  for (const heading of nav.group_order) {
    const paths = nav.item_order[heading] ?? [];
    const items: NavItemDef[] = [];
    for (const path of paths) {
      if (used.has(path) || hidden.has(path)) continue;
      const item = allItems.get(path);
      if (!item) continue;
      items.push(item);
      used.add(path);
    }
    if (items.length > 0) groups.push({ heading, items });
  }

  return groups;
}

/** True when a saved nav blob actually customises structure (not empty/null). */
export function hasCustomNavigation(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const c = config as Partial<NavigationConfig>;
  if (Array.isArray(c.group_order) && c.group_order.length > 0) return true;
  if (
    c.item_order &&
    typeof c.item_order === "object" &&
    Object.keys(c.item_order).length > 0
  ) {
    return true;
  }
  if (Array.isArray(c.hidden) && c.hidden.length > 0) return true;
  return false;
}

/**
 * Platform config is the base reference. When the organisation has a custom
 * navigation blob, that overrides workspace groups. Platform section always
 * comes from platform config. Empty org blobs do not replace platform.
 */
export function resolveCombinedNavigation(
  platformConfig: NavigationConfig | null | undefined,
  orgConfig: NavigationConfig | null | undefined,
): NavGroupDef[] {
  const platformMerged = mergeNavigationConfig(platformConfig, DEFAULT_NAV_GROUPS);
  const platformApplied = applyNavigationConfig(platformMerged, DEFAULT_NAV_GROUPS);
  const platformSection = platformApplied.filter((g) => g.heading === "Platform");

  if (!hasCustomNavigation(orgConfig)) {
    return platformApplied;
  }

  // Org override for workspace only — merge against APP catalog so Platform
  // paths never leak into org structure, and saved placements stay sticky.
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

export function moveItemToGroup(
  nav: NavigationConfig,
  path: string,
  fromHeading: string,
  toHeading: string,
): NavigationConfig {
  if (fromHeading === toHeading) return nav;
  const from = (nav.item_order[fromHeading] ?? []).filter((p) => p !== path);
  const to = [...(nav.item_order[toHeading] ?? []).filter((p) => p !== path), path];
  return {
    ...nav,
    item_order: {
      ...nav.item_order,
      [fromHeading]: from,
      [toHeading]: to,
    },
  };
}

export function addNavGroup(nav: NavigationConfig, heading: string): NavigationConfig {
  const name = heading.trim();
  if (!name || nav.group_order.includes(name)) return nav;
  return {
    ...nav,
    group_order: [...nav.group_order, name],
    item_order: { ...nav.item_order, [name]: [] },
  };
}

export function removeNavGroup(
  nav: NavigationConfig,
  heading: string,
  fallbackHeading?: string,
): NavigationConfig {
  if (!nav.group_order.includes(heading)) return nav;
  const moving = nav.item_order[heading] ?? [];
  const group_order = nav.group_order.filter((h) => h !== heading);
  const item_order = { ...nav.item_order };
  delete item_order[heading];

  const target =
    fallbackHeading && group_order.includes(fallbackHeading)
      ? fallbackHeading
      : group_order.find((h) => h !== "Platform") ?? group_order[0];

  if (target && moving.length) {
    item_order[target] = [...(item_order[target] ?? []), ...moving];
  }

  return { ...nav, group_order, item_order };
}

export function renameNavGroup(
  nav: NavigationConfig,
  from: string,
  to: string,
): NavigationConfig {
  const name = to.trim();
  if (!name || name === from || nav.group_order.includes(name)) return nav;
  return {
    ...nav,
    group_order: nav.group_order.map((h) => (h === from ? name : h)),
    item_order: {
      ...Object.fromEntries(
        Object.entries(nav.item_order).map(([k, v]) => (k === from ? [name, v] : [k, v])),
      ),
    },
  };
}
