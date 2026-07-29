/**
 * Sync work-item planned FTE $ into financials_monthly.opex_labor_planned.
 * Requires column from supabase/manual/opex_labor_planned_from_work_items.sql
 */

import { supabase } from "@/integrations/supabase/client";
import {
  aggregateOpexLaborPlannedByMonth,
  buildWorkItemDemandSlices,
  type ResourceRateRow,
  type WorkItemAssigneeLink,
  type WorkItemPlanInput,
} from "@/lib/work-item-fte-plan";

export async function syncOpexLaborPlannedFromWorkItems(orgId: string): Promise<{
  monthsUpserted: number;
  plannedTotal: number;
}> {
  const [{ data: workItems, error: wiErr }, { data: assignees, error: aErr }, { data: resources, error: rErr }] =
    await Promise.all([
      supabase
        .from("work_items" as any)
        .select(
          "id,project_id,stream_id,stage_gate_id,estimate_hours,planned_start,planned_end,status,owner_user_id",
        )
        .eq("org_id", orgId),
      supabase.from("work_item_assignees" as any).select("work_item_id,resource_id"),
      supabase.from("resources").select("id,user_id,cost_rate").eq("org_id", orgId),
    ]);
  if (wiErr) throw wiErr;
  if (aErr) throw aErr;
  if (rErr) throw rErr;

  const slices = buildWorkItemDemandSlices({
    workItems: (workItems ?? []) as unknown as WorkItemPlanInput[],
    assignees: (assignees ?? []) as unknown as WorkItemAssigneeLink[],
    resources: (resources ?? []) as unknown as ResourceRateRow[],
  });
  const rows = aggregateOpexLaborPlannedByMonth(slices);

  // Zero existing planned labor for this org's projects, then upsert fresh values.
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  if (projectIds.length) {
    await (supabase as any)
      .from("financials_monthly")
      .update({ opex_labor_planned: 0 })
      .in("project_id", projectIds);
  }

  let monthsUpserted = 0;
  let plannedTotal = 0;
  for (const row of rows) {
    plannedTotal += row.opex_labor_planned;
    // Try update existing month row first
    let q = (supabase as any)
      .from("financials_monthly")
      .update({ opex_labor_planned: row.opex_labor_planned })
      .eq("project_id", row.project_id)
      .eq("period_month", row.period_month);
    q = row.stream_id ? q.eq("stream_id", row.stream_id) : q.is("stream_id", null);
    const { data: updated, error: uErr } = await q.select("id");
    if (uErr) {
      // Column may be missing until SQL is pasted
      throw uErr;
    }
    if (updated?.length) {
      monthsUpserted += updated.length;
      continue;
    }
    const { error: iErr } = await (supabase as any).from("financials_monthly").insert({
      org_id: orgId,
      project_id: row.project_id,
      stream_id: row.stream_id,
      period_month: row.period_month,
      opex_labor_planned: row.opex_labor_planned,
      capex_planned: 0,
      capex_actual: 0,
      opex_planned: 0,
      opex_actual: 0,
    });
    if (iErr) throw iErr;
    monthsUpserted += 1;
  }

  return {
    monthsUpserted,
    plannedTotal: Math.round(plannedTotal * 100) / 100,
  };
}
