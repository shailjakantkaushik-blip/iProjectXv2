import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Map DB tables → React Query key prefixes to invalidate.
 * Never invalidate the entire cache — that causes multi-query refetch storms.
 */
const TABLE_QUERY_KEYS: Record<string, string[]> = {
  projects: ["projects"],
  project_streams: ["project_streams", "projects"],
  milestones: ["milestones", "milestones-feed"],
  stage_gates: ["stage_gates", "projects"],
  stage_gate_definitions: ["stage_gate_definitions"],
  risks: ["risks"],
  issues: ["issues"],
  actions: ["actions"],
  decisions: ["decisions"],
  dependencies: ["dependencies"],
  financials_monthly: ["financials_monthly", "monthly"],
  fy_allocations: ["fy_allocations"],
  benefits: ["benefits"],
  resources: ["resources"],
  resource_allocations: ["resource_allocations"],
  timesheets: ["timesheets"],
  timesheet_entries: ["timesheet_entries", "timesheets"],
  timesheet_approvals: ["timesheet_approvals", "timesheets"],
  work_item_assignees: ["work_item_assignees", "work_items"],
  sprints: ["sprints"],
  status_updates: ["status_updates"],
  change_requests: ["change_requests"],
  demand_pipeline: ["demand_pipeline"],
  business_units: ["business_units"],
  governance_channels: ["governance_channels"],
  stakeholders: ["stakeholders"],
  portfolio_scenarios: ["portfolio_scenarios"],
  scenario_projects: ["scenario_projects", "portfolio_scenarios"],
  documents: ["documents"],
  lessons_learned: ["lessons_learned"],
  // Notifications have their own realtime channel in the bell — do not fan out.
  work_items: ["work_items"],
  audit_events: ["audit_events", "audit-log"],
  support_tickets: ["support_tickets", "support"],
  support_ticket_comments: ["support_ticket_comments", "support_tickets", "support"],
};

/** High-churn tables: debounce longer so rapid edits don't refetch full sheets. */
const HIGH_CHURN = new Set([
  "financials_monthly",
  "resource_allocations",
  "fy_allocations",
  "status_updates",
]);

/** Realtime tables we listen to (exclude notifications — handled by the bell). */
const TABLES = Object.keys(TABLE_QUERY_KEYS).filter((t) => t !== "notifications");

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

/**
 * Global live-sync: edits (this tab, another tab, or another user) mark the
 * *related* React Query caches stale so open views refresh — without
 * refetching every query in the app.
 *
 * Egress safeguards:
 * - scoped invalidation (active queries only)
 * - longer debounce for high-churn finance/resource tables
 * - pause flush while the tab is hidden (flush on focus)
 */
export function useLiveSync(orgId: string | undefined) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTables = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!orgId) return;

    const flush = () => {
      timerRef.current = null;
      if (pendingTables.current.size === 0) return;
      // Defer network while backgrounded — same UX when user returns.
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
      // Prefer the edited table; fall back to common portfolio keys only.
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

    // Defer the heavy realtime fan-out until the browser is idle so first paint
    // and first queries are not competing with ~30 postgres_changes listeners.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const startRealtime = () => {
      if (cancelled || channel) return;
      channel = supabase.channel(`org-sync-${orgId}`);
      TABLES.forEach((table) => {
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
  }, [orgId, qc]);
}
