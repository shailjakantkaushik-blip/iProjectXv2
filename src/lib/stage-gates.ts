import { supabase } from "@/integrations/supabase/client";
import { STAGE_GATES_SELECT } from "@/lib/query-selects";

export type StageGateRow = {
  id: string;
  project_id: string;
  stream_id: string | null;
  gate_name: string;
  planned_date: string | null;
  actual_date: string | null;
  status: string | null;
  approver?: string | null;
  notes?: string | null;
};

/**
 * Load stage gates with a resilient select — if the full column list fails
 * (schema cache lag), fall back to the minimal columns needed for timelines.
 */
export async function fetchStageGates(): Promise<StageGateRow[]> {
  const primary = await supabase
    .from("stage_gates")
    .select(STAGE_GATES_SELECT as "*")
    .order("planned_date");
  if (!primary.error) return (primary.data ?? []) as StageGateRow[];

  const fallback = await supabase
    .from("stage_gates")
    .select("id,project_id,stream_id,gate_name,planned_date,actual_date,status")
    .order("planned_date");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as StageGateRow[];
}

/** Human label for data editor / dropdowns. */
export function formatStageGateLabel(
  g: { gate_name?: string | null; planned_date?: string | null; status?: string | null },
  streamLabel?: string | null,
): string {
  const name = (g.gate_name || "Gate").trim() || "Gate";
  const bits = [name];
  if (streamLabel) bits.push(streamLabel);
  if (g.planned_date) bits.push(String(g.planned_date).slice(0, 10));
  if (g.status) bits.push(String(g.status));
  return bits.join(" · ");
}
