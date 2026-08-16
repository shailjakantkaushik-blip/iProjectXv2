/**
 * Lightweight project lists for pickers / feeds.
 *
 * IMPORTANT: use query key `["projects", orgId, "options"]` — never
 * `["projects", orgId]` with a narrow select. Partial rows share that key with
 * full `select("*")` pages and wipe portfolio/finance fields from the cache.
 */

import { supabase } from "@/integrations/supabase/client";
import { methodUsesSprints, methodUsesStageGates } from "@/lib/delivery-methods";

export const PROJECT_OPTIONS_SELECT =
  "id,name,project_code,program,portfolio,sponsor,sponsor_stakeholder_id,rag,rag_override,status,delivery_method,updated_at" as const;

export type ProjectOptionLike = {
  project_code?: string | null;
  name?: string | null;
  delivery_method?: string | null;
};

/**
 * Waterfall (and blank) use stage gates; Hybrid uses both.
 * Prefer {@link methodUsesStageGates} when you have the org delivery_methods row.
 */
export function projectUsesStageGates(deliveryMethod?: string | null) {
  return methodUsesStageGates(null, deliveryMethod);
}

/** Agile / Hybrid use sprints. Prefer {@link methodUsesSprints} with a method row. */
export function projectUsesSprints(deliveryMethod?: string | null) {
  return methodUsesSprints(null, deliveryMethod);
}

/** Stable project dropdown order: code (numeric-aware), then name. */
export function compareProjectsByCodeName(a: ProjectOptionLike, b: ProjectOptionLike) {
  const code = String(a.project_code || "").localeCompare(String(b.project_code || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (code !== 0) return code;
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

export function sortProjectsByCodeName<T extends ProjectOptionLike>(projects: T[]): T[] {
  return [...projects].sort(compareProjectsByCodeName);
}

export function projectOptionsQueryKey(orgId: string | null | undefined) {
  return ["projects", orgId, "options"] as const;
}

const LAST_PROJECT_KEY = "ipx.last-project-id";

function lastProjectStorageKey(orgId: string) {
  return `${LAST_PROJECT_KEY}.${orgId}`;
}

/** Last project opened on the Projects workspace, scoped per organisation. */
export function readLastProjectId(orgId: string | null | undefined): string | null {
  if (!orgId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastProjectStorageKey(orgId));
  } catch {
    return null;
  }
}

export function writeLastProjectId(orgId: string | null | undefined, projectId: string) {
  if (!orgId || !projectId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastProjectStorageKey(orgId), projectId);
  } catch {
    /* quota / private mode */
  }
}

export function pickDefaultProjectId(
  projects: { id: string }[],
  orgId?: string | null,
): string | null {
  if (!projects.length) return null;
  const last = readLastProjectId(orgId);
  if (last && projects.some((p) => p.id === last)) return last;
  return projects[0]?.id ?? null;
}

export async function fetchProjectOptions() {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_OPTIONS_SELECT)
    .order("project_code")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
