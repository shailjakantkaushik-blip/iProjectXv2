import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { EditableCell } from "@/components/editable-cell";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { memberLabel, type OrgMember } from "@/lib/decision-approval";

export const Route = createFileRoute("/_authenticated/app/stakeholders")({
  component: StakeholdersPage,
});

const LEVELS = ["High", "Medium", "Low"];

async function setProjectPrimarySponsor(opts: {
  projectId: string;
  stakeholderId: string | null;
  sponsorName: string | null;
}) {
  const { error } = await (supabase as any)
    .from("projects")
    .update({
      sponsor_stakeholder_id: opts.stakeholderId,
      sponsor: opts.sponsorName,
    })
    .eq("id", opts.projectId);
  if (error) throw error;
}

function StakeholdersPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });
  const { data: stakeholders = [] } = useQuery({
    queryKey: ["stakeholders", orgId],
    queryFn: async () =>
      ((await (supabase as any).from("stakeholders").select("*").order("name")).data as any[]) ??
      [],
    enabled: !!orgId,
  });
  const { data: members = [] } = useQuery({
    queryKey: ["profiles", orgId, "stakeholder-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as OrgMember[];
    },
    enabled: !!orgId,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberOptions = useMemo(
    () =>
      [...members]
        .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b)))
        .map((m) => ({ value: m.id, label: memberLabel(m) })),
    [members],
  );

  const [form, setForm] = useState({
    project_id: "",
    name: "",
    role: "",
    email: "",
    user_id: "",
    is_sponsor: false,
    influence: "Medium",
    interest: "Medium",
    engagement_strategy: "",
    set_as_primary_sponsor: true,
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (s) => (projectById.get(s.project_id) as any)?.project_code || "",
      },
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      {
        key: "linked_user",
        label: "Linked user",
        getValue: (s) =>
          s.user_id
            ? memberLabel(
                memberById.get(s.user_id) || { id: s.user_id, full_name: null, email: null },
              )
            : "",
      },
      {
        key: "is_sponsor",
        label: "Sponsor",
        getValue: (s) => (s.is_sponsor ? "Yes" : "No"),
      },
      { key: "influence", label: "Influence" },
      { key: "interest", label: "Interest" },
      { key: "engagement_strategy", label: "Strategy" },
    ],
    [projectById, memberById],
  );

  const table = useColumnarTable(stakeholders, columns);

  const onPickUser = (userId: string) => {
    const m = memberById.get(userId);
    setForm((f) => ({
      ...f,
      user_id: userId,
      name: f.name.trim() ? f.name : memberLabel(m || { id: userId, full_name: null, email: null }),
      email: f.email.trim() ? f.email : m?.email?.trim() || "",
    }));
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.project_id || !form.name) throw new Error("Project and name required");
      const { data: row, error } = await (supabase as any)
        .from("stakeholders")
        .insert({
          org_id: orgId,
          project_id: form.project_id,
          name: form.name.trim(),
          role: form.role || null,
          email: form.email || null,
          user_id: form.user_id || null,
          is_sponsor: form.is_sponsor,
          influence: form.influence,
          interest: form.interest,
          engagement_strategy: form.engagement_strategy || null,
        })
        .select("id,name,project_id,is_sponsor")
        .single();
      if (error) throw error;
      if (row?.is_sponsor && form.set_as_primary_sponsor) {
        await setProjectPrimarySponsor({
          projectId: row.project_id,
          stakeholderId: row.id,
          sponsorName: row.name,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Stakeholder added");
      setForm((f) => ({
        ...f,
        name: "",
        role: "",
        email: "",
        user_id: "",
        is_sponsor: false,
        engagement_strategy: "",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSponsor = useMutation({
    mutationFn: async (s: any) => {
      const next = !s.is_sponsor;
      const { error } = await (supabase as any)
        .from("stakeholders")
        .update({ is_sponsor: next })
        .eq("id", s.id);
      if (error) throw error;
      if (next) {
        await setProjectPrimarySponsor({
          projectId: s.project_id,
          stakeholderId: s.id,
          sponsorName: s.name || null,
        });
      } else {
        const { data: proj } = await (supabase as any)
          .from("projects")
          .select("sponsor_stakeholder_id")
          .eq("id", s.project_id)
          .maybeSingle();
        if (proj?.sponsor_stakeholder_id === s.id) {
          // Prefer another sponsor on the same project, else clear.
          const other = stakeholders.find(
            (x: any) => x.project_id === s.project_id && x.id !== s.id && x.is_sponsor,
          );
          await setProjectPrimarySponsor({
            projectId: s.project_id,
            stakeholderId: other?.id ?? null,
            sponsorName: other?.name ?? null,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Sponsor updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLinkedUser = useMutation({
    mutationFn: async ({ id, user_id }: { id: string; user_id: string | null }) => {
      const patch: Record<string, unknown> = { user_id };
      if (user_id) {
        const m = memberById.get(user_id);
        if (m) {
          const row = stakeholders.find((s: any) => s.id === id);
          if (row && (!row.name || row.name === "Unknown")) patch.name = memberLabel(m);
          if (row && !row.email && m.email) patch.email = m.email;
        }
      }
      const { error } = await (supabase as any).from("stakeholders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      toast.success("Linked user updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makePrimary = useMutation({
    mutationFn: async (s: any) => {
      if (!s.is_sponsor) {
        const { error } = await (supabase as any)
          .from("stakeholders")
          .update({ is_sponsor: true })
          .eq("id", s.id);
        if (error) throw error;
      }
      await setProjectPrimarySponsor({
        projectId: s.project_id,
        stakeholderId: s.id,
        sponsorName: s.name || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Primary project sponsor set");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const row = stakeholders.find((s: any) => s.id === id);
      const { error } = await supabase.from("stakeholders").delete().eq("id", id);
      if (error) throw error;
      if (row) {
        const { data: proj } = await (supabase as any)
          .from("projects")
          .select("sponsor_stakeholder_id")
          .eq("id", row.project_id)
          .maybeSingle();
        if (proj?.sponsor_stakeholder_id === id) {
          const other = stakeholders.find(
            (x: any) => x.project_id === row.project_id && x.id !== id && x.is_sponsor,
          );
          await setProjectPrimarySponsor({
            projectId: row.project_id,
            stakeholderId: other?.id ?? null,
            sponsorName: other?.name ?? null,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stakeholders", orgId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const highInfluence = stakeholders.filter((s: any) => s.influence === "High").length;
  const sponsorCount = stakeholders.filter((s: any) => s.is_sponsor).length;
  const linkedCount = stakeholders.filter((s: any) => s.user_id).length;

  return (
    <PageExport name="Stakeholders" title="Stakeholders">
      <PageHeading
        title="Stakeholders"
        subtitle="Map influence and interest; optionally link logins and mark project sponsors"
        actions={
          <button
            type="button"
            className="st-btn-primary st-btn-inline"
            onClick={() =>
              document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            + Add stakeholder
          </button>
        }
      />

      <SectionFrame>
        <SectionTitle>Engagement snapshot</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Stakeholders" value={stakeholders.length} />
          <KpiCard label="High influence" value={highInfluence} />
          <KpiCard label="Sponsors" value={sponsorCount} />
          <KpiCard label="Linked logins" value={linkedCount} />
        </div>
      </SectionFrame>

      <SectionFrame id="log-form">
        <SectionTitle>Add Stakeholder</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Link a login when the person has an account. Mark Sponsor for governance; optionally set
          them as the project&apos;s primary sponsor (updates project sponsor display).
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            className="st-input"
            value={form.project_id}
            onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
          >
            <option value="">— Project —</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.user_id}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) setForm((f) => ({ ...f, user_id: "" }));
              else onPickUser(v);
            }}
          >
            <option value="">— Linked login (optional) —</option>
            {memberOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            className="st-input"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          />
          <input
            className="st-input"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <select
            className="st-input"
            value={form.influence}
            onChange={(e) => setForm((f) => ({ ...f, influence: e.target.value }))}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Influence: {l}
              </option>
            ))}
          </select>
          <select
            className="st-input"
            value={form.interest}
            onChange={(e) => setForm((f) => ({ ...f, interest: e.target.value }))}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Interest: {l}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm md:col-span-1">
            <input
              type="checkbox"
              checked={form.is_sponsor}
              onChange={(e) => setForm((f) => ({ ...f, is_sponsor: e.target.checked }))}
            />
            Sponsor
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.set_as_primary_sponsor}
              disabled={!form.is_sponsor}
              onChange={(e) => setForm((f) => ({ ...f, set_as_primary_sponsor: e.target.checked }))}
            />
            Set as primary project sponsor
          </label>
          <input
            className="st-input md:col-span-4"
            placeholder="Engagement strategy"
            value={form.engagement_strategy}
            onChange={(e) => setForm((f) => ({ ...f, engagement_strategy: e.target.value }))}
          />
          <button
            type="button"
            className="st-btn-primary md:col-span-4"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Save stakeholder"}
          </button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stakeholder Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search stakeholders…"
        />
        {table.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No stakeholders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={table.filters[col.key]}
                      onFilter={(v) => table.setColumnFilter(col.key, v)}
                      sortKey={table.sortKey}
                      sortDir={table.sortDir}
                      onToggleSort={table.toggleSort}
                    />
                  ))}
                  <th>Primary</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                      No stakeholders match filters.
                    </td>
                  </tr>
                ) : (
                  table.rows.map((s: any) => {
                    const proj = projectById.get(s.project_id) as any;
                    const isPrimary = proj?.sponsor_stakeholder_id === s.id;
                    return (
                      <tr key={s.id}>
                        <td className="font-medium">{proj?.project_code || "—"}</td>
                        <td>
                          <EditableCell
                            table="stakeholders"
                            rowId={s.id}
                            field="name"
                            value={s.name}
                            invalidateKeys={["stakeholders", "projects"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="stakeholders"
                            rowId={s.id}
                            field="role"
                            value={s.role}
                            invalidateKeys={["stakeholders"]}
                          />
                        </td>
                        <td>
                          <select
                            className="st-input h-8 min-w-[9rem] text-xs"
                            value={s.user_id || ""}
                            onChange={(e) =>
                              setLinkedUser.mutate({
                                id: s.id,
                                user_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">— None —</option>
                            {memberOptions.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              s.is_sponsor
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-600"
                            }`}
                            onClick={() => toggleSponsor.mutate(s)}
                          >
                            {s.is_sponsor ? "Sponsor" : "Mark sponsor"}
                          </button>
                        </td>
                        <td>
                          <EditableCell
                            table="stakeholders"
                            rowId={s.id}
                            field="influence"
                            value={s.influence}
                            invalidateKeys={["stakeholders"]}
                          />
                        </td>
                        <td>
                          <EditableCell
                            table="stakeholders"
                            rowId={s.id}
                            field="interest"
                            value={s.interest}
                            invalidateKeys={["stakeholders"]}
                          />
                        </td>
                        <td className="max-w-[220px]">
                          <EditableCell
                            table="stakeholders"
                            rowId={s.id}
                            field="engagement_strategy"
                            value={s.engagement_strategy}
                            invalidateKeys={["stakeholders"]}
                          />
                        </td>
                        <td>
                          {isPrimary ? (
                            <span className="text-[10px] font-semibold text-emerald-700">
                              Primary
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => makePrimary.mutate(s)}
                            >
                              Make primary
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            className="text-xs text-rose-600 hover:underline"
                            onClick={() => confirm("Delete stakeholder?") && del.mutate(s.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
