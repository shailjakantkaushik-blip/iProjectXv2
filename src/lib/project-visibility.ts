import type { AppRole } from "@/lib/auth-context";

export type ProjectVisibilityMode = "all" | "programs" | "projects";

export type ProjectVisibilityRule = {
  role: Exclude<AppRole, "platform_admin" | "admin" | "org_admin">;
  mode: ProjectVisibilityMode;
  /** When mode === "programs" */
  programs: string[];
  /** When mode === "projects" */
  project_ids: string[];
};

export type ProjectVisibilityConfig = {
  rules: ProjectVisibilityRule[];
};

export const VISIBILITY_ROLES: {
  key: ProjectVisibilityRule["role"];
  label: string;
  hint: string;
}[] = [
  { key: "executive", label: "Executive", hint: "Board / leadership viewers" },
  { key: "bu_lead", label: "BU Lead", hint: "Business unit leaders" },
  { key: "pm", label: "PM", hint: "Project managers" },
];

export function defaultProjectVisibility(): ProjectVisibilityConfig {
  return { rules: [] };
}

export function mergeProjectVisibility(partial: any): ProjectVisibilityConfig {
  const rulesIn = Array.isArray(partial?.rules) ? partial.rules : [];
  const rules: ProjectVisibilityRule[] = [];
  for (const r of rulesIn) {
    if (!r || typeof r !== "object") continue;
    const role = String(r.role || "");
    if (!VISIBILITY_ROLES.some((v) => v.key === role)) continue;
    const mode = (["all", "programs", "projects"].includes(r.mode) ? r.mode : "all") as ProjectVisibilityMode;
    rules.push({
      role: role as ProjectVisibilityRule["role"],
      mode,
      programs: Array.isArray(r.programs) ? r.programs.map(String).filter(Boolean) : [],
      project_ids: Array.isArray(r.project_ids) ? r.project_ids.map(String).filter(Boolean) : [],
    });
  }
  return { rules };
}

export function ruleForRole(
  cfg: ProjectVisibilityConfig,
  role: ProjectVisibilityRule["role"],
): ProjectVisibilityRule {
  return (
    cfg.rules.find((r) => r.role === role) ?? {
      role,
      mode: "all",
      programs: [],
      project_ids: [],
    }
  );
}

export function upsertRule(
  cfg: ProjectVisibilityConfig,
  rule: ProjectVisibilityRule,
): ProjectVisibilityConfig {
  const rest = cfg.rules.filter((r) => r.role !== rule.role);
  // "all" with empty lists can be omitted to keep config clean — still store explicitly
  // so admins can see the choice. Drop only if mode is all (default).
  if (rule.mode === "all") {
    return { rules: rest }; // default = all; no need to store
  }
  return { rules: [...rest, rule] };
}

/** Client-side filter (RLS is source of truth; this helps optimistic UI). */
export function filterProjectsByVisibility<T extends { id: string; program?: string | null }>(
  projects: T[],
  userRoles: AppRole[],
  cfg: ProjectVisibilityConfig,
): T[] {
  if (userRoles.some((r) => r === "admin" || r === "org_admin" || r === "platform_admin")) {
    return projects;
  }
  if (!cfg.rules.length) return projects;

  const applicable = cfg.rules.filter((r) => userRoles.includes(r.role));
  if (!applicable.length) return projects;

  return projects.filter((p) =>
    applicable.some((rule) => {
      if (rule.mode === "all") return true;
      if (rule.mode === "programs") {
        const prog = (p.program || "").trim().toLowerCase();
        return !!prog && rule.programs.some((x) => x.trim().toLowerCase() === prog);
      }
      return rule.project_ids.includes(p.id);
    }),
  );
}
