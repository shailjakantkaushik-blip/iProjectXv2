import { supabase } from "@/integrations/supabase/client";
import { STAGE_GATES_SELECT } from "@/lib/query-selects";
import { logQueryError, queryErrorMessage } from "@/lib/query-ui";

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

const MINIMAL_GATES =
  "id,project_id,stream_id,gate_name,planned_date,actual_date,status" as const;

/**
 * Load stage gates with a resilient select — if the full column list fails
 * (schema cache lag), fall back to minimal columns, then `*`.
 */
export async function fetchStageGates(): Promise<StageGateRow[]> {
  const primary = await supabase
    .from("stage_gates")
    .select(STAGE_GATES_SELECT as "*")
    .order("planned_date");
  if (!primary.error) return (primary.data ?? []) as StageGateRow[];

  logQueryError("stage_gates.select", primary.error);

  const fallback = await supabase
    .from("stage_gates")
    .select(MINIMAL_GATES)
    .order("planned_date");
  if (!fallback.error) return (fallback.data ?? []) as StageGateRow[];

  logQueryError("stage_gates.select.min", fallback.error);

  const star = await supabase.from("stage_gates").select("*").order("planned_date");
  if (star.error) {
    logQueryError("stage_gates.select.*", star.error);
    throw new Error(queryErrorMessage(star.error));
  }
  return (star.data ?? []) as StageGateRow[];
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
