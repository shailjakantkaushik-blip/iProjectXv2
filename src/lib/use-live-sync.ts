import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Tables that dashboards/pages read from — any change here rebroadcasts
// so every open page recomputes automatically.
const TABLES = [
  "projects", "project_streams", "milestones", "stage_gates", "stage_gate_definitions",
  "risks", "issues", "actions", "decisions", "dependencies",
  "financials_monthly", "fy_allocations", "benefits",
  "resources", "resource_allocations", "sprints",
  "status_updates", "change_requests", "demand_pipeline",
  "business_units", "governance_channels", "stakeholders",
  "portfolio_scenarios", "scenario_projects", "documents", "lessons_learned",
  "notifications", "work_items", "audit_events", "stakeholders", "issues",
];

// Cross-tab broadcast (edits made in another tab of the same app).
const BC_NAME = "pmo-data-sync";

/**
 * Global live-sync: any edit anywhere (this tab, another tab, or another
 * user via Supabase Realtime) invalidates all React Query caches so every
 * dashboard/chart/table refetches and recomputes in place.
 */
export function useLiveSync(orgId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const invalidateAll = () => { qc.invalidateQueries(); };

    // 1. Same-tab: EditableCell/TableEditor dispatch a CustomEvent on save.
    const onLocal = () => {
      invalidateAll();
      try { bc?.postMessage({ t: Date.now() }); } catch {}
    };
    window.addEventListener("pmo:data-changed", onLocal);

    // 2. Cross-tab via BroadcastChannel.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = () => invalidateAll();
    } catch {}

    // 3. Cross-user via Supabase Realtime (works only for tables added to
    //    the supabase_realtime publication; silently no-ops otherwise).
    const channel = supabase.channel(`org-sync-${orgId}`);
    TABLES.forEach((table) => {
      (channel as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
        () => invalidateAll(),
      );
    });
    channel.subscribe();

    return () => {
      window.removeEventListener("pmo:data-changed", onLocal);
      try { bc?.close(); } catch {}
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);
}
