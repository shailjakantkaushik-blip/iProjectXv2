import type { AppRole } from "@/lib/auth-context";

/** Blank Strategic Alignment / program / functional area in the access tree. */
export const UNASSIGNED_SCOPE = "(Unassigned)";

export type ProjectVisibilityMode = "all" | "programs" | "projects" | "scoped";

export type VisibilityRole = Exclude<AppRole, "platform_admin" | "admin" | "org_admin">;

/** Program × functional area grant (AND). Used when ticking FA under a program. */
export type ProgramAreaGrant = {
  program: string;
  functional_area: string;
};

export type ProjectVisibilityScope = {
  mode: ProjectVisibilityMode;
  /** Strategic Alignment (`projects.portfolio`). Parent covers all programs/projects/streams under it. */
  strategic_alignments: string[];
  programs: string[];
  /** Org-wide functional area. Parent covers all projects with that area. */
  functional_areas: string[];
  /** Nested FA under a program (program AND functional area). */
  program_areas: ProgramAreaGrant[];
  project_ids: string[];
  /** Stream grant unlocks the parent project at RLS; stream-aware UIs can still narrow. */
  stream_ids: string[];
};

export type ProjectVisibilityRule = ProjectVisibilityScope & {
  role: VisibilityRole;
};

export type ProjectVisibilityUserRule = ProjectVisibilityScope & {
  user_id: string;
};

export type ProjectVisibilityConfig = {
  /** Defaults for roles (executive / bu_lead / pm). */
  rules: ProjectVisibilityRule[];
  /** Per-user overrides — take precedence over role rules when present. */
  user_rules: ProjectVisibilityUserRule[];
};

export type VisibilityProject = {
  id: string;
  program?: string | null;
  portfolio?: string | null;
  functional_area?: string | null;
};

export type VisibilityStream = {
  id: string;
  project_id: string;
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

export const EMPTY_SCOPE_LISTS: Omit<ProjectVisibilityScope, "mode"> = {
  strategic_alignments: [],
  programs: [],
  functional_areas: [],
  program_areas: [],
  project_ids: [],
  stream_ids: [],
};

export function emptyVisibilityScope(mode: ProjectVisibilityMode = "all"): ProjectVisibilityScope {
  return { mode, ...cloneScopeLists(EMPTY_SCOPE_LISTS) };
}

function cloneScopeLists(
  lists: Omit<ProjectVisibilityScope, "mode">,
): Omit<ProjectVisibilityScope, "mode"> {
  return {
    strategic_alignments: [...lists.strategic_alignments],
    programs: [...lists.programs],
    functional_areas: [...lists.functional_areas],
    program_areas: lists.program_areas.map((x) => ({ ...x })),
    project_ids: [...lists.project_ids],
    stream_ids: [...lists.stream_ids],
  };
}

export function hasAdminAccessRole(roles: readonly string[]): boolean {
  return roles.some((r) => r === "admin" || r === "org_admin" || r === "platform_admin");
}

export function isLimitedVisibilityMode(mode: ProjectVisibilityMode): boolean {
  return mode !== "all";
}

export function dimensionValue(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return t || UNASSIGNED_SCOPE;
}

export function dimensionEquals(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return dimensionValue(a).toLowerCase() === dimensionValue(b).toLowerCase();
}

export function dimensionListHas(
  list: string[] | undefined,
  value: string | null | undefined,
): boolean {
  const n = dimensionValue(value).toLowerCase();
  return (list ?? []).some((x) => dimensionValue(x).toLowerCase() === n);
}

export function programAreaKey(
  program: string | null | undefined,
  functionalArea: string | null | undefined,
): string {
  return `${dimensionValue(program)}\0${dimensionValue(functionalArea)}`;
}

export function programAreaListHas(
  list: ProgramAreaGrant[] | undefined,
  program: string | null | undefined,
  functionalArea: string | null | undefined,
): boolean {
  const key = programAreaKey(program, functionalArea);
  return (list ?? []).some((x) => programAreaKey(x.program, x.functional_area) === key);
}

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return uniqStrings(raw.map((x) => String(x ?? "")));
}

function parseProgramAreas(raw: unknown): ProgramAreaGrant[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProgramAreaGrant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { program?: unknown; functional_area?: unknown };
    const program = dimensionValue(String(rec.program ?? ""));
    const functional_area = dimensionValue(String(rec.functional_area ?? ""));
    const key = programAreaKey(program, functional_area);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ program, functional_area });
  }
  return out;
}

function parseMode(raw: unknown): ProjectVisibilityMode {
  const m = String(raw ?? "").toLowerCase();
  if (m === "all" || m === "programs" || m === "projects" || m === "scoped") return m;
  return "all";
}

function parseScopeLists(raw: unknown): Omit<ProjectVisibilityScope, "mode"> {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    strategic_alignments: parseStringList(rec.strategic_alignments),
    programs: parseStringList(rec.programs),
    functional_areas: parseStringList(rec.functional_areas),
    program_areas: parseProgramAreas(rec.program_areas),
    project_ids: parseStringList(rec.project_ids),
    stream_ids: parseStringList(rec.stream_ids),
  };
}

export function defaultProjectVisibility(): ProjectVisibilityConfig {
  return { rules: [], user_rules: [] };
}

export function mergeProjectVisibility(partial: unknown): ProjectVisibilityConfig {
  const rec = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
  const rulesIn = Array.isArray(rec.rules) ? rec.rules : [];
  const rules: ProjectVisibilityRule[] = [];
  for (const r of rulesIn) {
    if (!r || typeof r !== "object") continue;
    const role = String((r as { role?: unknown }).role || "");
    if (!VISIBILITY_ROLES.some((v) => v.key === role)) continue;
    rules.push({
      role: role as VisibilityRole,
      mode: parseMode((r as { mode?: unknown }).mode),
      ...parseScopeLists(r),
    });
  }

  const usersIn = Array.isArray(rec.user_rules) ? rec.user_rules : [];
  const user_rules: ProjectVisibilityUserRule[] = [];
  const seen = new Set<string>();
  for (const r of usersIn) {
    if (!r || typeof r !== "object") continue;
    const row = r as { user_id?: unknown; mode?: unknown };
    const user_id = String(row.user_id || "").trim();
    if (!user_id || seen.has(user_id)) continue;
    seen.add(user_id);
    user_rules.push({
      user_id,
      mode: parseMode(row.mode),
      ...parseScopeLists(r),
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
      ...emptyVisibilityScope("all"),
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
      ...emptyVisibilityScope("all"),
    }
  );
}

export function scopeHasGrants(
  scope: Pick<ProjectVisibilityScope, keyof typeof EMPTY_SCOPE_LISTS>,
): boolean {
  return (
    scope.strategic_alignments.length > 0 ||
    scope.programs.length > 0 ||
    scope.functional_areas.length > 0 ||
    scope.program_areas.length > 0 ||
    scope.project_ids.length > 0 ||
    scope.stream_ids.length > 0
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
  return { ...cfg, rules: [...rest, { ...rule, mode: "scoped", ...cloneScopeLists(rule) }] };
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
  return {
    ...cfg,
    user_rules: [...rest, { ...rule, mode: "scoped", ...cloneScopeLists(rule) }],
  };
}

export function removeUserRule(
  cfg: ProjectVisibilityConfig,
  userId: string,
): ProjectVisibilityConfig {
  return { ...cfg, user_rules: cfg.user_rules.filter((r) => r.user_id !== userId) };
}

export function unionVisibilityScopes(scopes: ProjectVisibilityScope[]): ProjectVisibilityScope {
  if (!scopes.length) return emptyVisibilityScope("all");
  if (scopes.some((s) => !isLimitedVisibilityMode(s.mode))) return emptyVisibilityScope("all");
  const programAreas: ProgramAreaGrant[] = [];
  const seenPa = new Set<string>();
  for (const s of scopes) {
    for (const pa of s.program_areas) {
      const k = programAreaKey(pa.program, pa.functional_area);
      if (seenPa.has(k)) continue;
      seenPa.add(k);
      programAreas.push({
        program: dimensionValue(pa.program),
        functional_area: dimensionValue(pa.functional_area),
      });
    }
  }
  return {
    mode: "scoped",
    strategic_alignments: uniqStrings(scopes.flatMap((s) => s.strategic_alignments)),
    programs: uniqStrings(scopes.flatMap((s) => s.programs)),
    functional_areas: uniqStrings(scopes.flatMap((s) => s.functional_areas)),
    program_areas: programAreas,
    project_ids: uniqStrings(scopes.flatMap((s) => s.project_ids)),
    stream_ids: uniqStrings(scopes.flatMap((s) => s.stream_ids)),
  };
}

function streamsForProject(
  streams: VisibilityStream[] | undefined,
  projectId: string,
): VisibilityStream[] {
  return (streams ?? []).filter((s) => s.project_id === projectId);
}

/**
 * Why a project is visible under a limited rule. Parent grants include all children.
 * Stream-only grants still unlock the project (RLS is project-level).
 */
export function projectGrantReasons(
  project: VisibilityProject,
  scope: ProjectVisibilityScope,
  streams?: VisibilityStream[],
): {
  strategicAlignment: boolean;
  program: boolean;
  functionalArea: boolean;
  programArea: boolean;
  project: boolean;
  stream: boolean;
} {
  const projectStreams = streamsForProject(streams, project.id);
  return {
    strategicAlignment: dimensionListHas(scope.strategic_alignments, project.portfolio),
    program: dimensionListHas(scope.programs, project.program),
    functionalArea: dimensionListHas(scope.functional_areas, project.functional_area),
    programArea: programAreaListHas(scope.program_areas, project.program, project.functional_area),
    project: (scope.project_ids ?? []).includes(project.id),
    stream: projectStreams.some((s) => (scope.stream_ids ?? []).includes(s.id)),
  };
}

export function projectMatchesScope(
  project: VisibilityProject,
  scope: ProjectVisibilityScope,
  streams?: VisibilityStream[],
): boolean {
  if (!isLimitedVisibilityMode(scope.mode)) return true;
  const why = projectGrantReasons(project, scope, streams);
  return (
    why.strategicAlignment ||
    why.program ||
    why.functionalArea ||
    why.programArea ||
    why.project ||
    why.stream
  );
}

/** Parent (SA / program / org-wide FA / program×FA) covers this project — not a direct project/stream tick. */
export function projectCoveredByAncestor(
  project: VisibilityProject,
  scope: ProjectVisibilityScope,
): boolean {
  const why = projectGrantReasons(project, { ...scope, project_ids: [], stream_ids: [] }, []);
  return why.strategicAlignment || why.program || why.functionalArea || why.programArea;
}

export function streamCoveredByAncestor(
  project: VisibilityProject,
  _streamId: string,
  scope: ProjectVisibilityScope,
): boolean {
  if (projectCoveredByAncestor(project, scope)) return true;
  return (scope.project_ids ?? []).includes(project.id);
}

/**
 * Drop child grants that are already implied by a parent. Keeps saved JSON small and
 * prevents “unchecked child still visible via parent” confusion after a later parent edit.
 */
export function pruneScopeGrants(
  scope: ProjectVisibilityScope,
  projects: VisibilityProject[],
  streams: VisibilityStream[] = [],
): ProjectVisibilityScope {
  if (!isLimitedVisibilityMode(scope.mode)) return { ...emptyVisibilityScope("all") };

  const next: ProjectVisibilityScope = {
    mode: "scoped",
    ...cloneScopeLists(scope),
  };

  next.programs = next.programs.filter((program) => {
    const rows = projects.filter((p) => dimensionEquals(p.program, program));
    return (
      rows.length === 0 ||
      rows.some((p) => !dimensionListHas(next.strategic_alignments, p.portfolio))
    );
  });

  next.functional_areas = next.functional_areas.filter((area) => {
    const rows = projects.filter((p) => dimensionEquals(p.functional_area, area));
    return (
      rows.length === 0 ||
      rows.some(
        (p) =>
          !dimensionListHas(next.strategic_alignments, p.portfolio) &&
          !dimensionListHas(next.programs, p.program),
      )
    );
  });

  next.program_areas = next.program_areas.filter((pa) => {
    if (dimensionListHas(next.programs, pa.program)) return false;
    if (dimensionListHas(next.functional_areas, pa.functional_area)) return false;
    const rows = projects.filter(
      (p) =>
        dimensionEquals(p.program, pa.program) &&
        dimensionEquals(p.functional_area, pa.functional_area),
    );
    return (
      rows.length === 0 ||
      rows.some((p) => !dimensionListHas(next.strategic_alignments, p.portfolio))
    );
  });

  next.project_ids = next.project_ids.filter((id) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return true;
    return !projectCoveredByAncestor(p, next);
  });

  next.stream_ids = next.stream_ids.filter((id) => {
    const s = streams.find((x) => x.id === id);
    if (!s) return true;
    const p = projects.find((x) => x.id === s.project_id);
    if (!p) return true;
    return !streamCoveredByAncestor(p, id, next);
  });

  return next;
}

export function toggleStringGrant(list: string[], value: string, on: boolean): string[] {
  const token = dimensionValue(value);
  const has = dimensionListHas(list, token);
  if (on && !has) return uniqStrings([...list, token]);
  if (!on && has) return list.filter((x) => !dimensionEquals(x, token));
  return [...list];
}

export function toggleProgramAreaGrant(
  list: ProgramAreaGrant[],
  program: string,
  functionalArea: string,
  on: boolean,
): ProgramAreaGrant[] {
  const next = {
    program: dimensionValue(program),
    functional_area: dimensionValue(functionalArea),
  };
  const has = programAreaListHas(list, next.program, next.functional_area);
  if (on && !has) return [...list, next];
  if (!on && has) {
    return list.filter(
      (x) =>
        programAreaKey(x.program, x.functional_area) !==
        programAreaKey(next.program, next.functional_area),
    );
  }
  return list.map((x) => ({ ...x }));
}

export function describeScope(scope: ProjectVisibilityScope): string {
  if (!isLimitedVisibilityMode(scope.mode)) return "all projects";
  const parts: string[] = [];
  if (scope.strategic_alignments.length) {
    parts.push(
      `${scope.strategic_alignments.length} strategic alignment${scope.strategic_alignments.length === 1 ? "" : "s"} (${scope.strategic_alignments.join(", ")})`,
    );
  }
  if (scope.functional_areas.length) {
    parts.push(
      `${scope.functional_areas.length} functional area${scope.functional_areas.length === 1 ? "" : "s"} (${scope.functional_areas.join(", ")})`,
    );
  }
  if (scope.programs.length) {
    parts.push(
      `${scope.programs.length} program${scope.programs.length === 1 ? "" : "s"} (${scope.programs.join(", ")})`,
    );
  }
  if (scope.program_areas.length) {
    parts.push(
      `${scope.program_areas.length} program × area (${scope.program_areas
        .map((p) => `${p.program} / ${p.functional_area}`)
        .join(", ")})`,
    );
  }
  if (scope.project_ids.length) {
    parts.push(`${scope.project_ids.length} project${scope.project_ids.length === 1 ? "" : "s"}`);
  }
  if (scope.stream_ids.length) {
    parts.push(`${scope.stream_ids.length} stream${scope.stream_ids.length === 1 ? "" : "s"}`);
  }
  return parts.join("; ") || "no projects (nothing granted)";
}

/** Streams the user may work in. Parent project grants include every stream. */
export function filterStreamsByVisibility<T extends VisibilityStream>(
  streams: T[],
  projectsById: Map<string, VisibilityProject>,
  userId: string | null | undefined,
  userRoles: AppRole[],
  cfg: ProjectVisibilityConfig,
): T[] {
  const scope = effectiveVisibilityScope(cfg, userId, userRoles);
  if (!scope || !isLimitedVisibilityMode(scope.mode)) return streams;

  return streams.filter((s) => {
    const project = projectsById.get(s.project_id);
    if (!project) return false;
    if (!projectMatchesScope(project, scope, streams)) return false;
    if (projectCoveredByAncestor(project, scope) || scope.project_ids.includes(project.id))
      return true;
    return scope.stream_ids.includes(s.id);
  });
}

export function effectiveVisibilityScope(
  cfg: ProjectVisibilityConfig,
  userId: string | null | undefined,
  userRoles: AppRole[],
): ProjectVisibilityScope | null {
  if (userId) {
    const userRule = cfg.user_rules.find((r) => r.user_id === userId);
    if (userRule) return userRule;
  }
  // Admins see all unless a user override was set above.
  if (hasAdminAccessRole(userRoles)) {
    return emptyVisibilityScope("all");
  }
  if (!cfg.rules.length) return emptyVisibilityScope("all");
  const applicable = cfg.rules.filter((r) => userRoles.includes(r.role));
  if (!applicable.length) return emptyVisibilityScope("all");
  return unionVisibilityScopes(applicable);
}

/** Client-side filter (RLS is source of truth; this helps optimistic UI). */
export function filterProjectsByVisibility<T extends VisibilityProject>(
  projects: T[],
  userId: string | null | undefined,
  userRoles: AppRole[],
  cfg: ProjectVisibilityConfig,
  streams?: VisibilityStream[],
): T[] {
  if (userId) {
    const userRule = cfg.user_rules.find((r) => r.user_id === userId);
    if (userRule) {
      return projects.filter((p) => projectMatchesScope(p, userRule, streams));
    }
  }

  // platform_admin is org-scoped by RLS; within the fetched org set they see all
  // (same as org admins) unless a user override exists.
  if (hasAdminAccessRole(userRoles)) {
    return projects;
  }

  if (!cfg.rules.length) return projects;

  const applicable = cfg.rules.filter((r) => userRoles.includes(r.role));
  if (!applicable.length) return projects;

  return projects.filter((p) => applicable.some((rule) => projectMatchesScope(p, rule, streams)));
}
