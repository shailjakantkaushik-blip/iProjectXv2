import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, RefreshCw, Shield, UserRound, Users, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoading } from "@/components/page-loading";
import { FUNCTIONAL_AREAS, STRATEGIC_ALIGNMENT_LABEL } from "@/lib/ops-enhancements";
import { cn } from "@/lib/utils";
import {
  VISIBILITY_ROLES,
  defaultProjectVisibility,
  describeScope,
  dimensionEquals,
  dimensionListHas,
  dimensionValue,
  emptyVisibilityScope,
  effectiveVisibilityScope,
  hasAdminAccessRole,
  isLimitedVisibilityMode,
  mergeProjectVisibility,
  programAreaListHas,
  projectCoveredByAncestor,
  projectMatchesScope,
  pruneScopeGrants,
  removeUserRule,
  ruleForRole,
  ruleForUser,
  scopeHasGrants,
  streamCoveredByAncestor,
  toggleProgramAreaGrant,
  toggleStringGrant,
  upsertRule,
  upsertUserRule,
  type ProjectVisibilityConfig,
  type ProjectVisibilityRule,
  type ProjectVisibilityScope,
  type ProjectVisibilityUserRule,
  type VisibilityRole,
} from "@/lib/project-visibility";

export const Route = createFileRoute("/_authenticated/app/project-access")({
  component: ProjectAccessPage,
});

type AccessProject = {
  id: string;
  name: string;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
  functional_area?: string | null;
};

type AccessStream = {
  id: string;
  project_id: string;
  name: string;
  code?: string | null;
};

type TreeFilters = {
  alignment: string;
  functionalArea: string;
  program: string;
  projectQ: string;
  streamQ: string;
};

const EMPTY_FILTERS: TreeFilters = {
  alignment: "all",
  functionalArea: "all",
  program: "all",
  projectQ: "",
  streamQ: "",
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => dimensionValue(v)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function GrantCheckbox({
  checked,
  inherited,
  indeterminate,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  inherited?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onToggle: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const on = checked || !!inherited;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !on;
  }, [indeterminate, on]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="mt-0.5"
      checked={on}
      disabled={disabled || inherited}
      aria-label={label}
      title={
        inherited
          ? "Included by a parent grant. Uncheck the parent to assign this level on its own."
          : label
      }
      onChange={(e) => onToggle(e.target.checked)}
    />
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="min-w-[140px] flex-1 text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScopeEditor({
  disabled,
  label,
  scope,
  projects,
  streams,
  onChange,
}: {
  disabled?: boolean;
  label: string;
  scope: ProjectVisibilityScope;
  projects: AccessProject[];
  streams: AccessStream[];
  onChange: (partial: Partial<ProjectVisibilityScope>) => void;
}) {
  const [filters, setFilters] = useState<TreeFilters>(EMPTY_FILTERS);
  const limited = isLimitedVisibilityMode(scope.mode);

  const alignments = useMemo(
    () => uniqueSorted(projects.map((p) => dimensionValue(p.portfolio))),
    [projects],
  );
  const programs = useMemo(
    () => uniqueSorted(projects.map((p) => dimensionValue(p.program))),
    [projects],
  );
  const functionalAreas = useMemo(
    () =>
      uniqueSorted([
        ...FUNCTIONAL_AREAS,
        ...projects.map((p) => dimensionValue(p.functional_area)),
      ]),
    [projects],
  );

  const streamsByProject = useMemo(() => {
    const map = new Map<string, AccessStream[]>();
    for (const s of streams) {
      const list = map.get(s.project_id) ?? [];
      list.push(s);
      map.set(s.project_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [streams]);

  const coveredCount = useMemo(
    () => projects.filter((p) => projectMatchesScope(p, scope, streams)).length,
    [projects, scope, streams],
  );

  const applyLimited = (partial: Partial<ProjectVisibilityScope>) => {
    const merged: ProjectVisibilityScope = {
      ...scope,
      ...partial,
      mode: "scoped",
    };
    onChange(pruneScopeGrants(merged, projects, streams));
  };

  const projectQ = filters.projectQ.trim().toLowerCase();
  const streamQ = filters.streamQ.trim().toLowerCase();

  const visibleProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filters.alignment !== "all" && !dimensionEquals(p.portfolio, filters.alignment))
        return false;
      if (filters.program !== "all" && !dimensionEquals(p.program, filters.program)) return false;
      if (
        filters.functionalArea !== "all" &&
        !dimensionEquals(p.functional_area, filters.functionalArea)
      ) {
        return false;
      }
      if (projectQ) {
        const hay = `${p.name} ${p.project_code ?? ""}`.toLowerCase();
        if (!hay.includes(projectQ)) return false;
      }
      if (streamQ) {
        const list = streamsByProject.get(p.id) ?? [];
        if (!list.some((s) => `${s.name} ${s.code ?? ""}`.toLowerCase().includes(streamQ)))
          return false;
      }
      return true;
    });
  }, [
    projects,
    filters.alignment,
    filters.program,
    filters.functionalArea,
    projectQ,
    streamQ,
    streamsByProject,
  ]);

  const tree = useMemo(() => {
    type FaGroup = { fa: string; projects: AccessProject[] };
    type ProgramGroup = { program: string; areas: FaGroup[] };
    type SaGroup = { alignment: string; programs: ProgramGroup[] };

    const saMap = new Map<string, Map<string, Map<string, AccessProject[]>>>();
    for (const p of visibleProjects) {
      const sa = dimensionValue(p.portfolio);
      const program = dimensionValue(p.program);
      const fa = dimensionValue(p.functional_area);
      if (!saMap.has(sa)) saMap.set(sa, new Map());
      const progMap = saMap.get(sa)!;
      if (!progMap.has(program)) progMap.set(program, new Map());
      const faMap = progMap.get(program)!;
      if (!faMap.has(fa)) faMap.set(fa, []);
      faMap.get(fa)!.push(p);
    }

    const groups: SaGroup[] = Array.from(saMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([alignment, progMap]) => ({
        alignment,
        programs: Array.from(progMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([program, faMap]) => ({
            program,
            areas: Array.from(faMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([fa, rows]) => ({
                fa,
                projects: rows.slice().sort((a, b) => a.name.localeCompare(b.name)),
              })),
          })),
      }));
    return groups;
  }, [visibleProjects]);

  const visibleStreamsFor = (projectId: string) => {
    const list = streamsByProject.get(projectId) ?? [];
    if (!streamQ) return list;
    return list.filter((s) => `${s.name} ${s.code ?? ""}`.toLowerCase().includes(streamQ));
  };

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div>
        <Label>Visibility mode</Label>
        <Select
          value={limited ? "scoped" : "all"}
          onValueChange={(v) => {
            if (v === "all") {
              onChange(emptyVisibilityScope("all"));
              return;
            }
            applyLimited({ mode: "scoped" });
          }}
        >
          <SelectTrigger className="mt-1 max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="scoped">Limited — hierarchy grants</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!limited ? (
        <p className="text-sm text-muted-foreground">
          {label} can see every project in the organisation (default / inherit).
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Grant at any level. A parent includes everything beneath it ({STRATEGIC_ALIGNMENT_LABEL}{" "}
            → Program → Functional area → Project → Stream). Tick a child only when you want that
            slice without the parent. User overrides replace role grants (they do not add on top).
          </p>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" /> Filter the tree
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterSelect
                label={STRATEGIC_ALIGNMENT_LABEL}
                value={filters.alignment}
                onChange={(alignment) => setFilters((f) => ({ ...f, alignment }))}
                options={alignments}
              />
              <FilterSelect
                label="Program"
                value={filters.program}
                onChange={(program) => setFilters((f) => ({ ...f, program }))}
                options={programs}
              />
              <FilterSelect
                label="Functional area"
                value={filters.functionalArea}
                onChange={(functionalArea) => setFilters((f) => ({ ...f, functionalArea }))}
                options={functionalAreas}
              />
              <label className="min-w-[140px] flex-1 text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">Project</span>
                <Input
                  value={filters.projectQ}
                  onChange={(e) => setFilters((f) => ({ ...f, projectQ: e.target.value }))}
                  placeholder="Name or code"
                />
              </label>
              <label className="min-w-[140px] flex-1 text-xs">
                <span className="mb-1 block font-medium text-muted-foreground">Stream</span>
                <Input
                  value={filters.streamQ}
                  onChange={(e) => setFilters((f) => ({ ...f, streamQ: e.target.value }))}
                  placeholder="Stream name"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
              <span className="text-xs text-muted-foreground">
                Showing {visibleProjects.length} of {projects.length} projects · {coveredCount}{" "}
                visible to {label}
                {!scopeHasGrants(scope) ? " · nothing granted (they will see no projects)" : ""}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Grant a whole functional area</div>
            <p className="mb-2 text-xs text-muted-foreground">
              These chips grant every project with that functional area, across programs. Nested
              ticks under a program grant only that program × area.
            </p>
            <div className="flex flex-wrap gap-2">
              {functionalAreas.map((fa) => {
                const on = dimensionListHas(scope.functional_areas, fa);
                return (
                  <label
                    key={fa}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                      on ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <GrantCheckbox
                      checked={on}
                      label={`Grant functional area ${fa}`}
                      onToggle={(next) =>
                        applyLimited({
                          functional_areas: toggleStringGrant(scope.functional_areas, fa, next),
                        })
                      }
                    />
                    <span className="truncate">{fa}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects in this organisation yet.</p>
          ) : visibleProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects match these filters.</p>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-y-auto rounded-lg border p-2">
              {tree.map((sa) => {
                const saOn = dimensionListHas(scope.strategic_alignments, sa.alignment);
                return (
                  <div key={sa.alignment} className="rounded-md border border-transparent">
                    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <GrantCheckbox
                        checked={saOn}
                        label={`Grant ${STRATEGIC_ALIGNMENT_LABEL} ${sa.alignment}`}
                        onToggle={(next) =>
                          applyLimited({
                            strategic_alignments: toggleStringGrant(
                              scope.strategic_alignments,
                              sa.alignment,
                              next,
                            ),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{sa.alignment}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {STRATEGIC_ALIGNMENT_LABEL}
                        </span>
                      </span>
                    </label>
                    {sa.programs.map((prog) => {
                      const progInherited = saOn;
                      const progOn = dimensionListHas(scope.programs, prog.program);
                      return (
                        <div key={`${sa.alignment}:${prog.program}`} className="pl-5">
                          <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                            <GrantCheckbox
                              checked={progOn}
                              inherited={progInherited}
                              label={`Grant program ${prog.program}`}
                              onToggle={(next) =>
                                applyLimited({
                                  programs: toggleStringGrant(scope.programs, prog.program, next),
                                })
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{prog.program}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                Program
                                {progInherited ? " · via parent" : ""}
                              </span>
                            </span>
                          </label>
                          {prog.areas.map((area) => {
                            const faInherited = progInherited || progOn;
                            const faOrg = dimensionListHas(scope.functional_areas, area.fa);
                            const faPair = programAreaListHas(
                              scope.program_areas,
                              prog.program,
                              area.fa,
                            );
                            return (
                              <div
                                key={`${sa.alignment}:${prog.program}:${area.fa}`}
                                className="pl-5"
                              >
                                <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                                  <GrantCheckbox
                                    checked={faPair || faOrg}
                                    inherited={faInherited || faOrg}
                                    label={`Grant ${prog.program} / ${area.fa}`}
                                    onToggle={(next) =>
                                      applyLimited({
                                        program_areas: toggleProgramAreaGrant(
                                          scope.program_areas,
                                          prog.program,
                                          area.fa,
                                          next,
                                        ),
                                      })
                                    }
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="font-medium">{area.fa}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      Functional area
                                      {faInherited ? " · via parent" : faOrg ? " · whole area" : ""}
                                    </span>
                                  </span>
                                </label>
                                {area.projects.map((p) => {
                                  const projInherited = projectCoveredByAncestor(p, scope);
                                  const projOn = scope.project_ids.includes(p.id);
                                  const childStreams = visibleStreamsFor(p.id);
                                  const allStreams = streamsByProject.get(p.id) ?? [];
                                  const someStreams =
                                    !projInherited &&
                                    !projOn &&
                                    allStreams.some((s) => scope.stream_ids.includes(s.id));
                                  return (
                                    <div key={p.id} className="pl-5">
                                      <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                                        <GrantCheckbox
                                          checked={projOn}
                                          inherited={projInherited}
                                          indeterminate={someStreams}
                                          label={`Grant project ${p.name}`}
                                          onToggle={(next) =>
                                            applyLimited({
                                              project_ids: next
                                                ? Array.from(new Set([...scope.project_ids, p.id]))
                                                : scope.project_ids.filter((id) => id !== p.id),
                                            })
                                          }
                                        />
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {p.name}
                                        </span>
                                        <span className="truncate text-xs text-muted-foreground">
                                          {p.project_code || "Project"}
                                          {projInherited
                                            ? " · via parent"
                                            : someStreams
                                              ? " · some streams"
                                              : ""}
                                        </span>
                                      </label>
                                      {childStreams.map((s) => {
                                        const stInherited = streamCoveredByAncestor(p, s.id, scope);
                                        const stOn = scope.stream_ids.includes(s.id);
                                        return (
                                          <label
                                            key={s.id}
                                            className="flex items-start gap-2 rounded-md py-1 pl-7 pr-2 text-sm hover:bg-muted/50"
                                          >
                                            <GrantCheckbox
                                              checked={stOn}
                                              inherited={stInherited}
                                              label={`Grant stream ${s.name}`}
                                              onToggle={(next) =>
                                                applyLimited({
                                                  stream_ids: next
                                                    ? Array.from(
                                                        new Set([...scope.stream_ids, s.id]),
                                                      )
                                                    : scope.stream_ids.filter((id) => id !== s.id),
                                                })
                                              }
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                              {s.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              Stream
                                              {stInherited ? " · via parent" : ""}
                                              {s.code ? ` · ${s.code}` : ""}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

function ProjectAccessPage() {
  const { organization, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [cfg, setCfg] = useState<ProjectVisibilityConfig>(defaultProjectVisibility());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scopeTab, setScopeTab] = useState<"role" | "user">("role");
  const [activeRole, setActiveRole] = useState<VisibilityRole>("executive");
  const [activeUserId, setActiveUserId] = useState<string>("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects_access_admin", organization?.id],
    queryFn: async () => {
      const rpc = await supabase.rpc("org_admin_list_access_projects");
      if (!rpc.error) return rpc.data ?? [];
      const fallback = await supabase
        .from("projects")
        .select("id,name,project_code,program,portfolio,functional_area")
        .order("name");
      return fallback.data ?? [];
    },
    enabled: !!organization?.id && canEdit,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams_access_admin", organization?.id],
    queryFn: async () =>
      (await supabase.from("project_streams").select("id,project_id,name,code").order("name"))
        .data ?? [],
    enabled: !!organization?.id && canEdit,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["org_members_access", organization?.id],
    queryFn: async () => {
      const [{ data: profiles }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name").eq("org_id", organization!.id),
        supabase.from("user_roles").select("user_id,role").eq("org_id", organization!.id),
      ]);
      const roleMap = new Map<string, string[]>();
      for (const r of roleRows ?? []) {
        const list = roleMap.get(r.user_id) ?? [];
        list.push(String(r.role));
        roleMap.set(r.user_id, list);
      }
      return (profiles ?? [])
        .map((p) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          roles: roleMap.get(p.id) ?? [],
        }))
        .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));
    },
    enabled: !!organization?.id && canEdit,
  });

  const configurableMembers = members;

  useEffect(() => {
    void load();
    // Reload when the org changes; load reads the latest organization id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  useEffect(() => {
    if (!activeUserId && configurableMembers.length > 0) {
      setActiveUserId(configurableMembers[0].id);
    } else if (
      activeUserId &&
      configurableMembers.length > 0 &&
      !configurableMembers.some((m) => m.id === activeUserId)
    ) {
      setActiveUserId(configurableMembers[0].id);
    }
  }, [configurableMembers, activeUserId]);

  async function load() {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", organization.id)
        .maybeSingle();
      if (error) throw error;
      const ui = (data?.ui_config ?? {}) as { project_visibility?: unknown };
      setCfg(mergeProjectVisibility(ui.project_visibility));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load access rules");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!organization?.id || !canEdit) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", organization.id)
        .maybeSingle();
      const prev = (existing?.ui_config ?? {}) as Record<string, unknown>;
      const next = { ...prev, project_visibility: cfg };
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: next as never })
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Project visibility rules saved.");
      await refresh();
      window.dispatchEvent(new CustomEvent("pmo:org-ui-config-change", { detail: next }));
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Failed to save — apply supabase/manual/project_access_hierarchy.sql in the Supabase SQL Editor.",
      );
    } finally {
      setSaving(false);
    }
  }

  const roleRule = ruleForRole(cfg, activeRole);
  const userRule = activeUserId ? ruleForUser(cfg, activeUserId) : null;
  const activeMember = configurableMembers.find((m) => m.id === activeUserId);
  const memberLabel = activeMember?.full_name || activeMember?.email || "this user";

  const patchRole = (partial: Partial<ProjectVisibilityRule>) => {
    setCfg(upsertRule(cfg, { ...roleRule, ...partial }));
  };

  const patchUser = (partial: Partial<ProjectVisibilityUserRule>) => {
    if (!activeUserId) return;
    setCfg(upsertUserRule(cfg, { ...(userRule as ProjectVisibilityUserRule), ...partial }));
  };

  const copyRoleOntoUser = () => {
    if (!activeUserId || !activeMember) return;
    const merged = effectiveVisibilityScope(
      { ...cfg, user_rules: [] },
      null,
      activeMember.roles as Parameters<typeof effectiveVisibilityScope>[2],
    );
    setCfg(
      upsertUserRule(cfg, { user_id: activeUserId, ...(merged ?? emptyVisibilityScope("all")) }),
    );
  };

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Join an organisation first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Project data access"
          subtitle={`Control project visibility by role and by user in ${organization.name}. Admins see all unless you set a user override — they can still change it here.`}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reload
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canEdit || saving || loading}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Only organisation admins can edit these rules.
        </p>
      )}

      <SectionFrame>
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <SectionTitle>How it works</SectionTitle>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Set defaults by <strong className="text-foreground">role</strong> (Executive, BU Lead,
            PM), then optionally override a <strong className="text-foreground">direct user</strong>
            — including Admin / Org Admin. User rules replace that person&apos;s role (or admin)
            grants. Admins can always reopen this page and change the override.
          </li>
          <li>
            Hierarchy: <strong className="text-foreground">{STRATEGIC_ALIGNMENT_LABEL}</strong> →{" "}
            <strong className="text-foreground">Program</strong> →{" "}
            <strong className="text-foreground">Functional area</strong> →{" "}
            <strong className="text-foreground">Project</strong> →{" "}
            <strong className="text-foreground">Stream</strong>. A parent grant includes every
            child. Filter the tree, then tick the level that person or role should use.
          </li>
          <li>
            Stream grants unlock the parent project in the database (RLS is project-level). Admins
            with no user override still see everything in this organisation.
          </li>
          <li>
            Also see{" "}
            <Link to="/app/permissions" className="text-primary underline-offset-2 hover:underline">
              Role Permissions
            </Link>{" "}
            for page/table rights. After changing SQL, paste{" "}
            <code className="text-foreground">supabase/manual/project_access_hierarchy.sql</code> in
            the Supabase SQL Editor.
          </li>
        </ul>
      </SectionFrame>

      <SectionFrame>
        {loading ? (
          <PageLoading label="Loading access…" fullScreen={false} size="sm" />
        ) : (
          <Tabs value={scopeTab} onValueChange={(v) => setScopeTab(v as "role" | "user")}>
            <TabsList className="mb-4">
              <TabsTrigger value="role" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> By role
              </TabsTrigger>
              <TabsTrigger value="user" className="gap-1.5">
                <UserRound className="h-3.5 w-3.5" /> By user
              </TabsTrigger>
            </TabsList>

            <TabsContent value="role" className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <Label>Role to configure</Label>
                  <Select
                    value={activeRole}
                    onValueChange={(v) => setActiveRole(v as VisibilityRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILITY_ROLES.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  {VISIBILITY_ROLES.find((r) => r.key === activeRole)?.hint}
                  {cfg.rules.some((r) => r.role === activeRole)
                    ? " · Custom rule active"
                    : " · Default: all projects"}
                </p>
              </div>
              <ScopeEditor
                disabled={!canEdit}
                label={VISIBILITY_ROLES.find((r) => r.key === activeRole)?.label ?? activeRole}
                scope={roleRule}
                projects={projects as AccessProject[]}
                streams={streams as AccessStream[]}
                onChange={patchRole}
              />
            </TabsContent>

            <TabsContent value="user" className="space-y-4">
              {configurableMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No users in this organisation yet. Invite people from{" "}
                  <Link to="/app/team" className="text-primary underline-offset-2 hover:underline">
                    Team & Roles
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[260px] flex-1">
                      <Label>User to configure</Label>
                      <Select value={activeUserId} onValueChange={setActiveUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {configurableMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {(m.full_name || m.email) +
                                (m.roles.length ? ` · ${m.roles.join(", ")}` : "")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {cfg.user_rules.some((r) => r.user_id === activeUserId) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => activeUserId && setCfg(removeUserRule(cfg, activeUserId))}
                      >
                        Clear user override
                      </Button>
                    ) : (
                      <p className="pb-2 text-xs text-muted-foreground">
                        {activeMember && hasAdminAccessRole(activeMember.roles)
                          ? "No user override — this admin sees all projects"
                          : "No user override — inherits role rules"}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEdit || !activeUserId}
                      onClick={copyRoleOntoUser}
                    >
                      Copy role grants
                    </Button>
                  </div>
                  {activeMember && hasAdminAccessRole(activeMember.roles) && (
                    <p className="text-sm text-muted-foreground">
                      {memberLabel} is an admin. A user override limits what they see in the
                      workspace. They can still open this page and change or clear it.
                    </p>
                  )}
                  {userRule && (
                    <ScopeEditor
                      disabled={!canEdit}
                      label={memberLabel}
                      scope={userRule}
                      projects={projects as AccessProject[]}
                      streams={streams as AccessStream[]}
                      onChange={patchUser}
                    />
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Configured rules</SectionTitle>
        {cfg.rules.length === 0 && cfg.user_rules.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No custom rules — everyone sees all projects.
          </p>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            {cfg.rules.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Roles
                </p>
                <ul className="space-y-1">
                  {cfg.rules.map((r) => (
                    <li key={r.role} className="rounded-md border px-3 py-2">
                      <span className="font-medium capitalize">{r.role}</span>
                      {" → "}
                      {describeScope(r)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cfg.user_rules.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Users
                </p>
                <ul className="space-y-1">
                  {cfg.user_rules.map((r) => {
                    const m = members.find((x) => x.id === r.user_id);
                    const name = m?.full_name || m?.email || r.user_id.slice(0, 8);
                    return (
                      <li key={r.user_id} className="rounded-md border px-3 py-2">
                        <span className="font-medium">{name}</span>
                        {" → "}
                        {describeScope(r)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
