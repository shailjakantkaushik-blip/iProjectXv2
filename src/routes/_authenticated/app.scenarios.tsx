import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/scenarios")({
  component: ScenariosPage,
});

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0)
  );
}

function ScenariosPage() {
  const { organization, user } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    budget_cap: "",
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["portfolio_scenarios", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("portfolio_scenarios")
          .select("*")
          .eq("org_id", orgId!)
          .order("updated_at", { ascending: false })
      ).data ?? [],
    enabled: !!orgId,
  });

  const activeId = selectedId || (scenarios[0] as any)?.id || "";

  const { data: projects = [] } = useQuery({
    queryKey: ["projects_for_scenarios", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("projects")
          .select("id,name,project_code,budget,rag,status,priority")
          .eq("org_id", orgId!)
          .order("name")
      ).data ?? [],
    enabled: !!orgId,
  });

  const { data: scenarioProjects = [] } = useQuery({
    queryKey: ["scenario_projects", activeId],
    queryFn: async () =>
      (
        await supabase
          .from("scenario_projects")
          .select("*")
          .eq("scenario_id", activeId)
      ).data ?? [],
    enabled: !!activeId,
  });

  const byProject = useMemo(() => {
    const m = new Map<string, any>();
    (scenarioProjects as any[]).forEach((sp) => m.set(sp.project_id, sp));
    return m;
  }, [scenarioProjects]);

  const active = (scenarios as any[]).find((s) => s.id === activeId);

  const includedRows = useMemo(() => {
    return (projects as any[]).map((p) => {
      const sp = byProject.get(p.id);
      const included = sp ? Boolean(sp.included) : false;
      const adjBudget =
        sp?.adjusted_budget != null ? Number(sp.adjusted_budget) : Number(p.budget || 0);
      return { project: p, sp, included, adjBudget };
    });
  }, [projects, byProject]);

  const includedBudget = includedRows
    .filter((r) => r.included)
    .reduce((s, r) => s + r.adjBudget, 0);
  const includedCount = includedRows.filter((r) => r.included).length;
  const cap = Number(active?.budget_cap || 0);
  const overCap = cap > 0 && includedBudget > cap;

  const scenarioColumns: ColumnarColumn<(typeof includedRows)[number]>[] = useMemo(
    () => [
      {
        key: "included",
        label: "Include",
        getValue: (r) => (r.included ? "yes" : "no"),
      },
      {
        key: "project",
        label: "Project",
        getValue: (r) => `${r.project.name} ${r.project.project_code || ""}`,
      },
      {
        key: "status",
        label: "Status",
        getValue: (r) => r.project.status || "",
      },
      {
        key: "rag",
        label: "RAG",
        getValue: (r) => r.project.rag || "",
      },
      {
        key: "baseline",
        label: "Baseline budget",
        getValue: (r) => Number(r.project.budget || 0),
      },
      {
        key: "scenarioBudget",
        label: "Scenario budget",
        getValue: (r) => r.adjBudget,
      },
    ],
    [],
  );
  const scenarioTable = useColumnarTable(includedRows, scenarioColumns);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name.trim()) throw new Error("Name is required");
      const { data, error } = await supabase
        .from("portfolio_scenarios")
        .insert({
          org_id: orgId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          budget_cap: form.budget_cap ? Number(form.budget_cap) : null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["portfolio_scenarios", orgId] });
      setSelectedId(data.id);
      setCreating(false);
      setForm({ name: "", description: "", budget_cap: "" });
      toast.success("Scenario created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolio_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio_scenarios", orgId] });
      setSelectedId("");
      toast.success("Scenario deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleInclude = useMutation({
    mutationFn: async ({
      projectId,
      included,
      budget,
    }: {
      projectId: string;
      included: boolean;
      budget: number;
    }) => {
      if (!orgId || !activeId) throw new Error("No scenario selected");
      const existing = byProject.get(projectId);
      if (existing) {
        const { error } = await supabase
          .from("scenario_projects")
          .update({ included, adjusted_budget: budget })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scenario_projects").insert({
          org_id: orgId,
          scenario_id: activeId,
          project_id: projectId,
          included,
          adjusted_budget: budget,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenario_projects", activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateBudget = useMutation({
    mutationFn: async ({ projectId, budget }: { projectId: string; budget: number }) => {
      const existing = byProject.get(projectId);
      if (!existing) throw new Error("Include the project first");
      const { error } = await supabase
        .from("scenario_projects")
        .update({ adjusted_budget: budget })
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenario_projects", activeId] });
      toast.success("Budget updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageExport name="Portfolio_Scenarios" title="Portfolio Scenarios">
      <PageHeading
        title="Portfolio Scenarios"
        subtitle="What-if planning — include/exclude projects and test budget caps before commit (create/edit requires org admin)"
        actions={
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New scenario
          </Button>
        }
      />

      {creating && (
        <SectionFrame>
          <SectionTitle>Create scenario</SectionTitle>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="FY27 constrained portfolio"
              />
            </div>
            <div>
              <Label>Budget cap (optional)</Label>
              <Input
                type="number"
                value={form.budget_cap}
                onChange={(e) => setForm({ ...form, budget_cap: e.target.value })}
                placeholder="5000000"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Assumptions, constraints, decision ask…"
              />
            </div>
            <div className="md:col-span-2">
              <Button
                onClick={() => create.mutate()}
                disabled={!form.name.trim() || create.isPending}
              >
                Create
              </Button>
            </div>
          </div>
        </SectionFrame>
      )}

      <SectionFrame>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px]">
            <Label>Active scenario</Label>
            <Select value={activeId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scenario…" />
              </SelectTrigger>
              <SelectContent>
                {(scenarios as any[]).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activeId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm("Delete this scenario?")) remove.mutate(activeId);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>

        {!activeId ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Create a scenario to start what-if planning across the portfolio.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {active?.description || "No description"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Included projects" value={includedCount} />
              <KpiCard label="Included budget" value={money(includedBudget)} />
              <KpiCard
                label="Budget cap"
                value={cap > 0 ? money(cap) : "—"}
              />
              <KpiCard
                label="Headroom"
                value={cap > 0 ? money(cap - includedBudget) : "—"}
                accent={overCap ? "#dc2626" : "#15803d"}
              />
            </div>
            {overCap && (
              <p className="mt-2 text-sm font-medium text-red-600">
                Included budget exceeds the scenario cap by {money(includedBudget - cap)}.
              </p>
            )}
          </>
        )}
      </SectionFrame>

      {activeId && (
        <SectionFrame>
          <SectionTitle>Projects in scenario</SectionTitle>
          <ColumnarToolbar
            globalQ={scenarioTable.globalQ}
            onGlobalQ={scenarioTable.setGlobalQ}
            shown={scenarioTable.rows.length}
            total={scenarioTable.total}
            dirty={scenarioTable.isDirty}
          onClear={scenarioTable.clearAll}
            placeholder="Search scenario projects…"
          />
          <div className="mt-3 overflow-x-auto">
            <table className="st-table w-full">
              <thead>
                <tr>
                  {scenarioColumns.map((col) => (
                    <ColumnarTh
                      key={col.key}
                      column={col}
                      filter={scenarioTable.filters[col.key]}
                      onFilter={(v) => scenarioTable.setColumnFilter(col.key, v)}
                      sortKey={scenarioTable.sortKey}
                      sortDir={scenarioTable.sortDir}
                      onToggleSort={scenarioTable.toggleSort}
                      align={
                        col.key === "baseline" || col.key === "scenarioBudget"
                          ? "right"
                          : "left"
                      }
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarioTable.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={scenarioColumns.length}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {scenarioTable.total === 0
                        ? "No projects available."
                        : "No matching projects."}
                    </td>
                  </tr>
                ) : (
                  scenarioTable.rows.map(({ project: p, included, adjBudget }) => (
                    <tr key={p.id}>
                      <td>
                        <Switch
                          checked={included}
                          onCheckedChange={(v) =>
                            toggleInclude.mutate({
                              projectId: p.id,
                              included: v,
                              budget: Number(p.budget || 0),
                            })
                          }
                        />
                      </td>
                      <td>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.project_code || "—"}
                        </div>
                      </td>
                      <td className="text-sm">{p.status ?? "—"}</td>
                      <td className="text-sm">{p.rag ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        {money(Number(p.budget || 0))}
                      </td>
                      <td className="text-right">
                        <Input
                          className="ml-auto h-8 w-32 text-right"
                          type="number"
                          disabled={!included}
                          defaultValue={adjBudget}
                          key={`${p.id}-${adjBudget}-${included}`}
                          onBlur={(e) => {
                            if (!included) return;
                            const next = Number(e.target.value);
                            if (!Number.isFinite(next) || next === adjBudget) return;
                            updateBudget.mutate({ projectId: p.id, budget: next });
                          }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      )}
    </PageExport>
  );
}
