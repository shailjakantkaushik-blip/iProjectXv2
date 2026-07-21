import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, RefreshCw, Shield, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VISIBILITY_ROLES,
  defaultProjectVisibility,
  mergeProjectVisibility,
  ruleForRole,
  upsertRule,
  type ProjectVisibilityConfig,
  type ProjectVisibilityMode,
  type ProjectVisibilityRule,
} from "@/lib/project-visibility";

export const Route = createFileRoute("/_authenticated/app/project-access")({
  component: ProjectAccessPage,
});

function ProjectAccessPage() {
  const { organization, roles, refresh } = useAuth();
  const canEdit = isAdmin(roles);
  const [cfg, setCfg] = useState<ProjectVisibilityConfig>(defaultProjectVisibility());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] =
    useState<ProjectVisibilityRule["role"]>("executive");

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

  const programs = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects as any[]) {
      if (p.program && String(p.program).trim()) s.add(String(p.program).trim());
    }
    return Array.from(s).sort();
  }, [projects]);

  useEffect(() => {
    void load();
  }, [organization?.id]);

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
          "Failed to save — apply migration 20260721090000_role_project_visibility.sql in Supabase.",
      );
    } finally {
      setSaving(false);
    }
  }

  const rule = ruleForRole(cfg, activeRole);

  const patchRule = (partial: Partial<ProjectVisibilityRule>) => {
    setCfg(upsertRule(cfg, { ...rule, ...partial }));
  };

  const toggleProgram = (program: string) => {
    const has = rule.programs.includes(program);
    patchRule({
      mode: "programs",
      programs: has ? rule.programs.filter((p) => p !== program) : [...rule.programs, program],
    });
  };

  const toggleProject = (id: string) => {
    const has = rule.project_ids.includes(id);
    patchRule({
      mode: "projects",
      project_ids: has ? rule.project_ids.filter((p) => p !== id) : [...rule.project_ids, id],
    });
  };

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Join an organisation first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Project data access"
          subtitle={`Control which projects each role can see in ${organization.name}. Admins always see all.`}
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
            Per role choose <strong className="text-foreground">All projects</strong>, specific{" "}
            <strong className="text-foreground">Programs</strong>, or selected{" "}
            <strong className="text-foreground">Projects</strong>.
          </li>
          <li>
            Org Admin / Admin always see everything. Roles without a custom rule keep full access.
          </li>
          <li>
            Enforced in the database (projects + linked registers). Also see{" "}
            <Link to="/app/permissions" className="text-primary underline-offset-2 hover:underline">
              Role Permissions
            </Link>{" "}
            for page/table rights.
          </li>
        </ul>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Label>Role to configure</Label>
            <Select
              value={activeRole}
              onValueChange={(v) => setActiveRole(v as ProjectVisibilityRule["role"])}
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <fieldset disabled={!canEdit} className="space-y-4">
            <div>
              <Label>Visibility mode</Label>
              <Select
                value={rule.mode}
                onValueChange={(v) => patchRule({ mode: v as ProjectVisibilityMode })}
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

            {rule.mode === "programs" && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" /> Programs visible to {activeRole}
                </div>
                {programs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No program labels found on projects yet. Set the Program field on projects first.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {programs.map((prog) => {
                      const on = rule.programs.includes(prog);
                      return (
                        <label
                          key={prog}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            on ? "border-primary bg-primary/5" : "border-border"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleProgram(prog)}
                          />
                          <span className="truncate font-medium">{prog}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {rule.mode === "projects" && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" /> Projects visible to {activeRole}
                </div>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects in this organisation yet.</p>
                ) : (
                  <div className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-lg border p-2">
                    {(projects as any[]).map((p) => {
                      const on = rule.project_ids.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                            on ? "bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleProject(p.id)}
                          />
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

            {rule.mode === "all" && (
              <p className="text-sm text-muted-foreground">
                This role can see every project in the organisation (default).
              </p>
            )}
          </fieldset>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Configured rules</SectionTitle>
        {cfg.rules.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No custom rules — everyone sees all projects.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {cfg.rules.map((r) => (
              <li key={r.role} className="rounded-md border px-3 py-2">
                <span className="font-medium capitalize">{r.role}</span>
                {" → "}
                {r.mode === "all" && "all projects"}
                {r.mode === "programs" &&
                  `${r.programs.length} program${r.programs.length === 1 ? "" : "s"} (${r.programs.join(", ") || "none"})`}
                {r.mode === "projects" &&
                  `${r.project_ids.length} project${r.project_ids.length === 1 ? "" : "s"}`}
              </li>
            ))}
          </ul>
        )}
      </SectionFrame>
    </div>
  );
}
