/**
 * Lightweight project lists for pickers / feeds.
 *
 * IMPORTANT: use query key `["projects", orgId, "options"]` — never
 * `["projects", orgId]` with a narrow select. Partial rows share that key with
 * full `select("*")` pages and wipe portfolio/finance fields from the cache.
 */

import { supabase } from "@/integrations/supabase/client";

export const PROJECT_OPTIONS_SELECT =
  "id,name,project_code,program,sponsor,rag,status,updated_at" as const;

export function projectOptionsQueryKey(orgId: string | null | undefined) {
  return ["projects", orgId, "options"] as const;
}

export async function fetchProjectOptions() {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_OPTIONS_SELECT)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
