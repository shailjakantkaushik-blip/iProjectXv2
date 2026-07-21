import type { AppRole } from "@/lib/auth-context";

export type ProjectVisibilityMode = "all" | "programs" | "projects";

export type VisibilityRole = Exclude<AppRole, "platform_admin" | "admin" | "org_admin">;

export type ProjectVisibilityRule = {
  role: VisibilityRole;
  mode: ProjectVisibilityMode;
  programs: string[];
  project_ids: string[];
};

export type ProjectVisibilityUserRule = {
  user_id: string;
  mode: ProjectVisibilityMode;
  programs: string[];
  project_ids: string[];
};

export type ProjectVisibilityConfig = {
  /** Defaults for roles (executive / bu_lead / pm). */
  rules: ProjectVisibilityRule[];
  /** Per-user overrides — take precedence over role rules when present. */
  user_rules: ProjectVisibilityUserRule[];
};

export const VISIBILITY_ROLES: {
  key: VisibilityRole;
  label: string;
  hint: string;
}[] = [
  { key: "executive", label: "Executive", hint: "Board / leadership viewers" },
  { key: "bu_lead", label: "BU Lead", hint: "Business unit leaders" },
  { key: "pm", label: "PM", hint: "Project managers" },
];

function parseMode(raw: unknown): ProjectVisibilityMode {
  return (["all", "programs", "projects"].includes(String(raw))
    ? String(raw)
    : "all") as ProjectVisibilityMode;
}

function parseLists(raw: any): Pick<ProjectVisibilityRule, "programs" | "project_ids"> {
  return {
    programs: Array.isArray(raw?.programs) ? raw.programs.map(String).filter(Boolean) : [],
    project_ids: Array.isArray(raw?.project_ids) ? raw.project_ids.map(String).filter(Boolean) : [],
  };
}

export function defaultProjectVisibility(): ProjectVisibilityConfig {
  return { rules: [], user_rules: [] };
}

export function mergeProjectVisibility(partial: any): ProjectVisibilityConfig {
  const rulesIn = Array.isArray(partial?.rules) ? partial.rules : [];
  const rules: ProjectVisibilityRule[] = [];
  for (const r of rulesIn) {
    if (!r || typeof r !== "object") continue;
    const role = String(r.role || "");
    if (!VISIBILITY_ROLES.some((v) => v.key === role)) continue;
    rules.push({
      role: role as VisibilityRole,
      mode: parseMode(r.mode),
      ...parseLists(r),
    });
  }

  const usersIn = Array.isArray(partial?.user_rules) ? partial.user_rules : [];
  const user_rules: ProjectVisibilityUserRule[] = [];
  const seen = new Set<string>();
  for (const r of usersIn) {
    if (!r || typeof r !== "object") continue;
    const user_id = String(r.user_id || "").trim();
    if (!user_id || seen.has(user_id)) continue;
    seen.add(user_id);
    user_rules.push({
      user_id,
      mode: parseMode(r.mode),
      ...parseLists(r),
    });
  }

  return { rules, user_rules };
}

export function ruleForRole(
  cfg: ProjectVisibilityConfig,
  role: VisibilityRole,
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

export function ruleForUser(
  cfg: ProjectVisibilityConfig,
  userId: string,
): ProjectVisibilityUserRule {
  return (
    cfg.user_rules.find((r) => r.user_id === userId) ?? {
      user_id: userId,
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
  if (rule.mode === "all") {
    return { ...cfg, rules: rest };
  }
  return { ...cfg, rules: [...rest, rule] };
}

export function upsertUserRule(
  cfg: ProjectVisibilityConfig,
  rule: ProjectVisibilityUserRule,
): ProjectVisibilityConfig {
  const rest = cfg.user_rules.filter((r) => r.user_id !== rule.user_id);
  if (rule.mode === "all") {
    // Explicit "all" for a user removes the override (inherit role again)
    return { ...cfg, user_rules: rest };
  }
  return { ...cfg, user_rules: [...rest, rule] };
}

export function removeUserRule(
  cfg: ProjectVisibilityConfig,
  userId: string,
): ProjectVisibilityConfig {
  return { ...cfg, user_rules: cfg.user_rules.filter((r) => r.user_id !== userId) };
}

function matchesScope(
  mode: ProjectVisibilityMode,
  programs: string[],
  projectIds: string[],
  project: { id: string; program?: string | null },
): boolean {
  if (mode === "all") return true;
  if (mode === "programs") {
    const prog = (project.program || "").trim().toLowerCase();
    return !!prog && programs.some((x) => x.trim().toLowerCase() === prog);
  }
  return projectIds.includes(project.id);
}

/** Client-side filter (RLS is source of truth; this helps optimistic UI). */
export function filterProjectsByVisibility<T extends { id: string; program?: string | null }>(
  projects: T[],
  userId: string | null | undefined,
  userRoles: AppRole[],
  cfg: ProjectVisibilityConfig,
): T[] {
  if (userRoles.some((r) => r === "admin" || r === "org_admin" || r === "platform_admin")) {
    return projects;
  }

  if (userId) {
    const userRule = cfg.user_rules.find((r) => r.user_id === userId);
    if (userRule) {
      return projects.filter((p) =>
        matchesScope(userRule.mode, userRule.programs, userRule.project_ids, p),
      );
    }
  }

  if (!cfg.rules.length) return projects;

  const applicable = cfg.rules.filter((r) => userRoles.includes(r.role));
  if (!applicable.length) return projects;

  return projects.filter((p) =>
    applicable.some((rule) => matchesScope(rule.mode, rule.programs, rule.project_ids, p)),
  );
}
