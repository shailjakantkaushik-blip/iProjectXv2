import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, RefreshCw, Shield, Eye, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
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
import {
  VISIBILITY_ROLES,
  defaultProjectVisibility,
  mergeProjectVisibility,
  removeUserRule,
  ruleForRole,
  ruleForUser,
  upsertRule,
  upsertUserRule,
  type ProjectVisibilityConfig,
  type ProjectVisibilityMode,
  type ProjectVisibilityRule,
  type ProjectVisibilityUserRule,
  type VisibilityRole,
} from "@/lib/project-visibility";

export const Route = createFileRoute("/_authenticated/app/project-access")({
  component: ProjectAccessPage,
});

type ScopeFields = {
  mode: ProjectVisibilityMode;
  programs: string[];
  project_ids: string[];
};

function ScopeEditor({
  disabled,
  label,
  scope,
  programs,
  projects,
  onChange,
}: {
  disabled?: boolean;
  label: string;
  scope: ScopeFields;
  programs: string[];
  projects: { id: string; name: string; project_code?: string | null; program?: string | null }[];
  onChange: (partial: Partial<ScopeFields>) => void;
}) {
  const toggleProgram = (program: string) => {
    const has = scope.programs.includes(program);
    onChange({
      mode: "programs",
      programs: has ? scope.programs.filter((p) => p !== program) : [...scope.programs, program],
    });
  };

  const toggleProject = (id: string) => {
    const has = scope.project_ids.includes(id);
    onChange({
      mode: "projects",
      project_ids: has ? scope.project_ids.filter((p) => p !== id) : [...scope.project_ids, id],
    });
  };

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div>
        <Label>Visibility mode</Label>
        <Select
          value={scope.mode}
          onValueChange={(v) => onChange({ mode: v as ProjectVisibilityMode })}
        >
          <SelectTrigger className="mt-1 max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="programs">Specific programs</SelectItem>
            <SelectItem value="projects">Specific projects</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scope.mode === "programs" && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4" /> Programs visible to {label}
          </div>
          {programs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No program labels found on projects yet. Set the Program field on projects first.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {programs.map((prog) => {
                const on = scope.programs.includes(prog);
                return (
                  <label
                    key={prog}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      on ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleProgram(prog)} />
                    <span className="truncate font-medium">{prog}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {scope.mode === "projects" && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4" /> Projects visible to {label}
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects in this organisation yet.</p>
          ) : (
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {projects.map((p) => {
                const on = scope.project_ids.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      on ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleProject(p.id)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.project_code || p.program || "—"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {scope.mode === "all" && (
        <p className="text-sm text-muted-foreground">
          {label} can see every project in the organisation (default / inherit).
        </p>
      )}
    </fieldset>
  );
}

function describeScope(mode: ProjectVisibilityMode, programs: string[], projectIds: string[]) {
  if (mode === "all") return "all projects";
  if (mode === "programs") {
    return `${programs.length} program${programs.length === 1 ? "" : "s"} (${programs.join(", ") || "none"})`;
  }
  return `${projectIds.length} project${projectIds.length === 1 ? "" : "s"}`;
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
    queryFn: async () =>
      (
        await supabase
          .from("projects")
          .select("id,name,project_code,program")
          .order("name")
      ).data ?? [],
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
        .sort((a, b) =>
          (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
        );
    },
    enabled: !!organization?.id && canEdit,
  });

  const programs = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects as any[]) {
      if (p.program && String(p.program).trim()) s.add(String(p.program).trim());
    }
    return Array.from(s).sort();
  }, [projects]);

  const configurableMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          !m.roles.some((r) => r === "admin" || r === "org_admin" || r === "platform_admin"),
      ),
    [members],
  );

  useEffect(() => {
    void load();
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
      const ui = ((data as any)?.ui_config ?? {}) as any;
      setCfg(mergeProjectVisibility(ui.project_visibility));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load access rules");
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
      const prev = ((existing as any)?.ui_config ?? {}) as Record<string, unknown>;
      const next = { ...prev, project_visibility: cfg };
      const { error } = await supabase
        .from("organizations")
        .update({ ui_config: next as any })
        .eq("id", organization.id);
      if (error) throw error;
      toast.success("Project visibility rules saved.");
      await refresh();
      window.dispatchEvent(new CustomEvent("pmo:org-ui-config-change", { detail: next }));
    } catch (e: any) {
      toast.error(
        e?.message ??
          "Failed to save — apply migration 20260721100000_user_role_project_visibility.sql in Supabase.",
      );
    } finally {
      setSaving(false);
    }
  }

  const roleRule = ruleForRole(cfg, activeRole);
  const userRule = activeUserId ? ruleForUser(cfg, activeUserId) : null;
  const activeMember = configurableMembers.find((m) => m.id === activeUserId);
  const memberLabel =
    activeMember?.full_name || activeMember?.email || "this user";

  const patchRole = (partial: Partial<ProjectVisibilityRule>) => {
    setCfg(upsertRule(cfg, { ...roleRule, ...partial }));
  };

  const patchUser = (partial: Partial<ProjectVisibilityUserRule>) => {
    if (!activeUserId) return;
    setCfg(upsertUserRule(cfg, { ...(userRule as ProjectVisibilityUserRule), ...partial }));
  };

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Join an organisation first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Project data access"
          subtitle={`Control project visibility by role and by user in ${organization.name}. Admins always see all.`}
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
        <p className="text-sm text-muted-foreground">Only organisation admins can edit these rules.</p>
      )}

      <SectionFrame>
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <SectionTitle>How it works</SectionTitle>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Set defaults by <strong className="text-foreground">role</strong> (Executive, BU Lead, PM).
          </li>
          <li>
            Optionally override for a specific <strong className="text-foreground">user</strong> —
            user rules take precedence over their role.
          </li>
          <li>
            Modes: all projects, specific programs, or selected projects. Org Admin / Admin always
            see everything.
          </li>
          <li>
            Also see{" "}
            <Link to="/app/permissions" className="text-primary underline-offset-2 hover:underline">
              Role Permissions
            </Link>{" "}
            for page/table rights.
          </li>
        </ul>
      </SectionFrame>

      <SectionFrame>
        {loading ? (
          <PageLoading label="Loading access…" fullScreen={false} size="md" />
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
                programs={programs}
                projects={projects as any[]}
                onChange={patchRole}
              />
            </TabsContent>

            <TabsContent value="user" className="space-y-4">
              {configurableMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No non-admin users in this organisation yet. Invite people from{" "}
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
                        No user override — inherits role rules
                      </p>
                    )}
                  </div>
                  {userRule && (
                    <ScopeEditor
                      disabled={!canEdit}
                      label={memberLabel}
                      scope={userRule}
                      programs={programs}
                      projects={projects as any[]}
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
                      {describeScope(r.mode, r.programs, r.project_ids)}
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
                        {describeScope(r.mode, r.programs, r.project_ids)}
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
