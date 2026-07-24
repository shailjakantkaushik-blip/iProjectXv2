import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Tables that dashboards/pages read from — any change here rebroadcasts
// so every open page recomputes automatically.
const TABLES = [
  "projects",
  "project_streams",
  "milestones",
  "stage_gates",
  "stage_gate_definitions",
  "risks",
  "issues",
  "actions",
  "decisions",
  "dependencies",
  "financials_monthly",
  "fy_allocations",
  "benefits",
  "resources",
  "resource_allocations",
  "sprints",
  "status_updates",
  "change_requests",
  "demand_pipeline",
  "business_units",
  "governance_channels",
  "stakeholders",
  "portfolio_scenarios",
  "scenario_projects",
  "documents",
  "lessons_learned",
  "notifications",
  "work_items",
  "audit_events",
  "support_tickets",
  "support_ticket_comments",
];

const BC_NAME = "pmo-data-sync";
const DEBOUNCE_MS = 280;

/**
 * Global live-sync: any edit anywhere (this tab, another tab, or another
 * user via Supabase Realtime) marks active React Query caches stale so
 * open dashboards refetch. Debounced to avoid refetch storms.
 */
export function useLiveSync(orgId: string | undefined) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const scheduleInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Only refetch queries currently mounted — inactive stay stale until next visit.
        void qc.invalidateQueries({ refetchType: "active" });
      }, DEBOUNCE_MS);
    };

    const onLocal = () => {
      scheduleInvalidate();
      try {
        bc?.postMessage({ t: Date.now() });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pmo:data-changed", onLocal);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = () => scheduleInvalidate();
    } catch {
      /* ignore */
    }

    const channel = supabase.channel(`org-sync-${orgId}`);
    TABLES.forEach((table) => {
      (channel as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
        () => scheduleInvalidate(),
      );
    });
    channel.subscribe();

    return () => {
      window.removeEventListener("pmo:data-changed", onLocal);
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);
}
