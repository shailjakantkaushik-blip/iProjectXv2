import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Map DB tables → React Query key prefixes to invalidate.
 * Never invalidate the entire cache — that causes multi-query refetch storms.
 */
export const TABLE_QUERY_KEYS: Record<string, string[]> = {
  projects: ["projects", "portfolio-kpis", "portfolio-stats"],
  project_streams: ["project_streams", "projects"],
  milestones: ["milestones", "milestones-feed"],
  stage_gates: ["stage_gates", "projects"],
  stage_gate_definitions: ["stage_gate_definitions"],
  risks: ["risks", "portfolio-kpis"],
  issues: ["issues", "portfolio-kpis"],
  actions: ["actions", "portfolio-kpis"],
  decisions: ["decisions"],
  dependencies: ["dependencies"],
  financials_monthly: ["financials_monthly", "monthly"],
  opex_other_costs: ["opex_other_costs", "financials_monthly", "projects"],
  fy_allocations: ["fy_allocations"],
  benefits: ["benefits"],
  resources: ["resources"],
  resource_allocations: ["resource_allocations"],
  timesheets: ["timesheets"],
  timesheet_entries: ["timesheet_entries", "timesheets"],
  timesheet_approvals: ["timesheet_approvals", "timesheets"],
  work_item_assignees: ["work_item_assignees", "work_items"],
  sprints: ["sprints", "work_items"],
  status_updates: ["status_updates"],
  change_requests: ["change_requests"],
  demand_pipeline: ["demand_pipeline", "projects"],
  business_units: ["business_units"],
  governance_channels: ["governance_channels"],
  stakeholders: ["stakeholders"],
  portfolio_scenarios: ["portfolio_scenarios"],
  scenario_projects: ["scenario_projects", "portfolio_scenarios"],
  documents: ["documents"],
  lessons_learned: ["lessons_learned"],
  work_items: ["work_items", "portfolio-kpis"],
  work_item_links: ["work_item_links", "work_items"],
  entity_comments: ["entity_comments"],
  stage_gate_checklist_items: ["stage_gate_checklist_items"],
  stage_gate_checklist_responses: ["stage_gate_checklist_responses"],
  custom_reports: ["custom_reports"],
  audit_events: ["audit_events", "audit-log"],
  support_tickets: ["support_tickets", "support"],
  support_ticket_comments: ["support_ticket_comments", "support_tickets", "support"],
  org_kpi_summaries: ["portfolio-kpis"],
  export_jobs: ["export_jobs"],
};

/** High-churn tables: debounce longer so rapid edits don't refetch full sheets. */
const HIGH_CHURN = new Set([
  "financials_monthly",
  "resource_allocations",
  "fy_allocations",
  "status_updates",
]);

/** Always excluded from global fan-out (own channels / optional). */
const REALTIME_OPTIONAL = new Set([
  "timesheets",
  "timesheet_entries",
  "timesheet_approvals",
  "work_item_assignees",
]);

/** Minimal always-on set — cheap invalidation for shell + KPI freshness. */
export const LIVE_SYNC_CORE_TABLES = [
  "projects",
  "project_streams",
  "org_kpi_summaries",
] as const;

/** Route presets — subscribe only to what the open surface needs. */
export const LIVE_SYNC_ROUTE_TABLES: Record<string, readonly string[]> = {
  "/app": [...LIVE_SYNC_CORE_TABLES, "status_updates"],
  "/app/executive": [
    ...LIVE_SYNC_CORE_TABLES,
    "stage_gates",
    "financials_monthly",
    "risks",
    "milestones",
  ],
  "/app/portfolio-pulse": [
    ...LIVE_SYNC_CORE_TABLES,
    "stage_gates",
    "work_items",
    "risks",
    "dependencies",
    "decisions",
    "resource_allocations",
    "financials_monthly",
  ],
  "/app/executive-cockpit": [
    ...LIVE_SYNC_CORE_TABLES,
    "stage_gates",
    "decisions",
    "actions",
    "benefits",
    "fy_allocations",
    "risks",
  ],
  "/app/executive-reports": [
    ...LIVE_SYNC_CORE_TABLES,
    "risks",
    "actions",
    "stage_gates",
    "milestones",
  ],
  "/app/timeline": [...LIVE_SYNC_CORE_TABLES, "stage_gates"],
  "/app/projects": [...LIVE_SYNC_CORE_TABLES, "stakeholders", "stage_gates"],
  "/app/financials": [
    ...LIVE_SYNC_CORE_TABLES,
    "financials_monthly",
    "fy_allocations",
    "opex_other_costs",
  ],
  "/app/work-items": [
    ...LIVE_SYNC_CORE_TABLES,
    "work_items",
    "work_item_links",
    "work_item_assignees",
    "sprints",
    "stage_gates",
    "resource_allocations",
  ],
  "/app/work-board": [...LIVE_SYNC_CORE_TABLES, "work_items", "sprints"],
  "/app/timesheets": [
    ...LIVE_SYNC_CORE_TABLES,
    "work_items",
    "timesheets",
    "timesheet_entries",
    "timesheet_approvals",
    "resources",
  ],
  "/app/resources": [...LIVE_SYNC_CORE_TABLES, "resources", "resource_allocations"],
  "/app/risks": [...LIVE_SYNC_CORE_TABLES, "risks", "issues"],
  "/app/project-infographic": [
    ...LIVE_SYNC_CORE_TABLES,
    "stage_gates",
    "milestones",
    "risks",
    "issues",
    "work_items",
    "work_item_links",
    "financials_monthly",
    "documents",
    "resource_allocations",
  ],
  "/app/data-editor": [...LIVE_SYNC_CORE_TABLES, "export_jobs"],
  "/app/audit-log": ["audit_events", "export_jobs"],
};

export function resolveLiveSyncTables(pathname: string | undefined): string[] {
  if (!pathname) return [...LIVE_SYNC_CORE_TABLES];
  // Longest prefix match
  let best: readonly string[] | null = null;
  let bestLen = -1;
  for (const [route, tables] of Object.entries(LIVE_SYNC_ROUTE_TABLES)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      if (route.length > bestLen) {
        best = tables;
        bestLen = route.length;
      }
    }
  }
  return [...(best ?? LIVE_SYNC_CORE_TABLES)];
}

const BC_NAME = "pmo-data-sync";
const DEBOUNCE_MS = 800;
const HIGH_CHURN_DEBOUNCE_MS = 2000;

function queryKeysForTables(tables: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const table of tables) {
    const mapped = TABLE_QUERY_KEYS[table];
    if (mapped) mapped.forEach((k) => keys.add(k));
    else keys.add(table);
  }
  return [...keys];
}

function invalidateScoped(qc: QueryClient, tables: Iterable<string>) {
  const keys = queryKeysForTables(tables);
  if (keys.length === 0) return;
  for (const key of keys) {
    void qc.invalidateQueries({ queryKey: [key], refetchType: "active" });
  }
}

function debounceFor(tables: Iterable<string>): number {
  for (const t of tables) {
    if (HIGH_CHURN.has(t)) return HIGH_CHURN_DEBOUNCE_MS;
  }
  return DEBOUNCE_MS;
}

export type LiveSyncOptions = {
  /** Explicit table allowlist. When omitted, uses route presets / core. */
  tables?: string[];
  /** Current pathname for route-scoped presets. */
  pathname?: string;
};

/**
 * Route-scoped live-sync: edits mark related React Query caches stale.
 * Subscribes only to tables needed by the open surface (plus core), not ~30
 * global postgres_changes listeners.
 */
export function useLiveSync(orgId: string | undefined, options?: LiveSyncOptions) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTables = useRef<Set<string>>(new Set());

  const tablesKey = (options?.tables ?? resolveLiveSyncTables(options?.pathname)).join(",");

  useEffect(() => {
    if (!orgId) return;

    const listenTables = (options?.tables ?? resolveLiveSyncTables(options?.pathname)).filter(
      (t) => t !== "notifications" && TABLE_QUERY_KEYS[t],
    );

    const flush = () => {
      timerRef.current = null;
      if (pendingTables.current.size === 0) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const batch = pendingTables.current;
      pendingTables.current = new Set();
      invalidateScoped(qc, batch);
    };

    const scheduleInvalidate = (tables: string[] | string) => {
      const list = Array.isArray(tables) ? tables : [tables];
      for (const t of list) {
        if (t) pendingTables.current.add(t);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceFor(pendingTables.current));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingTables.current.size > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, 100);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { table?: string } | undefined;
      const table = detail?.table;
      scheduleInvalidate(table || "projects");
      try {
        bc?.postMessage({ tables: [table || "projects"], t: Date.now() });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pmo:data-changed", onLocal);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = (msg) => {
        const tables = (msg.data as { tables?: string[] } | undefined)?.tables;
        if (tables?.length) scheduleInvalidate(tables);
        else scheduleInvalidate("projects");
      };
    } catch {
      /* ignore */
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const startRealtime = () => {
      if (cancelled || channel) return;
      // Include optional high-churn tables only when the route asked for them.
      const tables = listenTables.filter(
        (t) => !REALTIME_OPTIONAL.has(t) || listenTables.includes(t),
      );
      channel = supabase.channel(`org-sync-${orgId}-${tables.length}`);
      tables.forEach((table) => {
        (channel as any).on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
          () => scheduleInvalidate(table),
        );
      });
      channel.subscribe();
    };

    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;

    if (typeof ric === "function") {
      idleId = ric(startRealtime, { timeout: 1800 });
    } else {
      timeoutId = setTimeout(startRealtime, 1200);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("pmo:data-changed", onLocal);
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId != null) {
        (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(
          idleId,
        );
      }
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, qc, tablesKey]);
}
