import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT, STAGE_GATES_SELECT, STAGE_GATE_DEFINITIONS_SELECT } from "@/lib/query-selects";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend } from "recharts";
import { GATE_STATUS_COLORS as STATUS_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { ExpandableChart } from "@/components/expandable-chart";
import { persistCurrentPhaseFromGates, resolveCurrentAndNextGate, resolveCurrentStage } from "@/lib/project-phase";
import { fetchOrgStreams, formatProjectStreamRef, formatStreamLabel } from "@/lib/project-streams";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import {
  GateChecklistBadge,
  StageGateChecklistPanel,
} from "@/components/stage-gate-checklist-panel";
import {
  approvalBlockedReason,
  summarizeGateChecklist,
} from "@/lib/stage-gate-checklist";
import {
  fetchDeliveryMethods,
  findDeliveryMethod,
  methodUsesStageGates,
  deliveryMethodsQueryKey,
} from "@/lib/delivery-methods";

export const Route = createFileRoute("/_authenticated/app/stage-gates")({
  component: StageGatesPage,
});

const PALETTE = CHART_SERIES;

function StageGatesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [checklistGateId, setChecklistGateId] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => (await supabase.from("projects").select(PROJECT_PORTFOLIO_SELECT as "*")).data ?? [],
    enabled: !!organization,
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["stage_gates", organization?.id],
    queryFn: async () =>
      (await supabase.from("stage_gates").select(STAGE_GATES_SELECT as "*").order("planned_date")).data ?? [],
    enabled: !!organization,
  });

  const { data: defs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order")
      ).data ?? [],
    enabled: !!organization,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["project_streams", organization?.id],
    queryFn: () => fetchOrgStreams(organization!.id),
    enabled: !!organization?.id,
  });

  const { data: deliveryMethods = [] } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId,
  });

  const phasesByMethodId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of defs as any[]) {
      const mid = String(d.delivery_method_id || "");
      if (!mid) continue;
      const list = m.get(mid) || [];
      list.push(d.gate_name);
      m.set(mid, list);
    }
    return m;
  }, [defs]);

  const phasesForProject = useCallback(
    (p: any): string[] => {
      const method =
        (p?.delivery_method_id &&
          deliveryMethods.find((m) => m.id === p.delivery_method_id)) ||
        findDeliveryMethod(deliveryMethods, p?.delivery_method);
      if (!methodUsesStageGates(method, p?.delivery_method)) return [];
      if (method?.id && phasesByMethodId.has(method.id)) {
        return phasesByMethodId.get(method.id) || [];
      }
      // Fallback: names already on this project's gates
      return Array.from(
        new Set(
          (gates as any[])
            .filter((g) => g.project_id === p?.id)
            .map((g) => g.gate_name)
            .filter(Boolean),
        ),
      ) as string[];
    },
    [deliveryMethods, phasesByMethodId, gates],
  );

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["stage_gate_checklist_items", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .select("id,gate_name,title,required,sort_order")
        .eq("org_id", orgId!);
      if (error) return [];
      return (data ?? []) as unknown as {
        id: string;
        gate_name: string;
        title: string;
        required: boolean;
        sort_order: number;
      }[];
    },
    enabled: !!orgId,
  });

  const { data: checklistResponses = [] } = useQuery({
    queryKey: ["stage_gate_checklist_responses", orgId, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_checklist_responses" as any)
        .select("stage_gate_id,checklist_item_id,completed")
        .eq("org_id", orgId!);
      if (error) return [];
      return (data ?? []) as unknown as {
        stage_gate_id: string;
        checklist_item_id: string;
        completed: boolean;
      }[];
    },
    enabled: !!orgId,
  });

  const itemsByGateName = useMemo(() => {
    const m = new Map<string, typeof checklistItems>();
    for (const i of checklistItems) {
      const list = m.get(i.gate_name) || [];
      list.push(i);
      m.set(i.gate_name, list);
    }
    return m;
  }, [checklistItems]);

  const responsesByGateId = useMemo(() => {
    const m = new Map<string, typeof checklistResponses>();
    for (const r of checklistResponses) {
      const list = m.get(r.stage_gate_id) || [];
      list.push(r);
      m.set(r.stage_gate_id, list);
    }
    return m;
  }, [checklistResponses]);

  const summaryForGate = useCallback(
    (g: any) =>
      summarizeGateChecklist(
        itemsByGateName.get(g?.gate_name || "") || [],
        responsesByGateId.get(g?.id) || [],
      ),
    [itemsByGateName, responsesByGateId],
  );

  const setGateStatus = useMutation({
    mutationFn: async ({ id, status, projectId }: { id: string; status: string; projectId: string }) => {
      const g = gates.find((x: any) => x.id === id) as any;
      if (/approved/i.test(status) && g) {
        const reason = approvalBlockedReason(summaryForGate(g));
        if (reason) throw new Error(reason);
      }
      const { error } = await supabase
        .from("stage_gates")
        .update({
          status,
          ...( /approved/i.test(status)
            ? { actual_date: new Date().toISOString().slice(0, 10) }
            : {}),
        } as never)
        .eq("id", id);
      if (error) throw error;
      if (projectId) await persistCurrentPhaseFromGates(supabase as any, projectId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stage_gates"] });
      toast.success("Gate status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Gate distribution: names from gates actually on projects (Agile vs Waterfall templates).
  const distribution = useMemo(() => {
    const orderIdx = new Map<string, number>();
    (defs as any[]).forEach((d, i) => {
      if (!orderIdx.has(d.gate_name)) orderIdx.set(d.gate_name, d.sort_order ?? i);
    });
    const names = Array.from(
      new Set((gates as any[]).map((g) => g.gate_name).filter(Boolean)),
    ).sort((a, b) => {
      const oa = orderIdx.get(a as string);
      const ob = orderIdx.get(b as string);
      if (oa !== undefined && ob !== undefined) return oa - ob;
      return String(a).localeCompare(String(b));
    }) as string[];
    const statuses = ["Approved", "In Review", "Pending", "On Hold", "Rejected"];
    return names.map((n: string) => {
      const row: any = { gate: n };
      statuses.forEach((s) => {
        row[s] = gates.filter(
          (g: any) => g.gate_name === n && (g.status || "Pending") === s,
        ).length;
      });
      row.__total = statuses.reduce((sum, s) => sum + row[s], 0);
      return row;
    });
  }, [gates, defs]);

  // KPIs from actual gates
  const total = gates.length;
  const approved = gates.filter((g: any) => g.status === "Approved").length;
  const inReview = gates.filter((g: any) => g.status === "In Review").length;
  const pending = gates.filter((g: any) => (g.status || "Pending") === "Pending").length;
  const overdue = gates.filter(
    (g: any) =>
      g.planned_date &&
      new Date(g.planned_date) < new Date() &&
      g.status !== "Approved" &&
      g.status !== "Rejected",
  ).length;

  // Register: for each project, show CURRENT + NEXT using THAT method's gate order.
  const gatesByProject = useMemo(() => {
    const m = new Map<string, any[]>();
    gates.forEach((g: any) => {
      if (!m.has(g.project_id)) m.set(g.project_id, []);
      m.get(g.project_id)!.push(g);
    });
    m.forEach((arr, projectId) => {
      const project = (projects as any[]).find((p) => p.id === projectId);
      const orderIdx = new Map<string, number>();
      phasesForProject(project).forEach((name, i) => orderIdx.set(name, i));
      arr.sort((a, b) => {
        const oa = orderIdx.get(a.gate_name);
        const ob = orderIdx.get(b.gate_name);
        if (oa !== undefined && ob !== undefined) return oa - ob;
        const da = a.planned_date ? new Date(a.planned_date).getTime() : Infinity;
        const db = b.planned_date ? new Date(b.planned_date).getTime() : Infinity;
        return da - db;
      });
    });
    return m;
  }, [gates, projects, phasesForProject]);

  const register = useMemo(() => {
    const streamsByProject = new Map<string, any[]>();
    (streams as any[]).forEach((s) => {
      const list = streamsByProject.get(s.project_id) || [];
      list.push(s);
      streamsByProject.set(s.project_id, list);
    });

    const rows: {
      key: string;
      project: any;
      streamLabel: string | null;
      streamRef: string | null;
      current: any;
      next: any;
      phase: string | null;
      rag: string | null;
    }[] = [];

    for (const p of projects as any[]) {
      const orgPhases = phasesForProject(p);
      const projectGateCount = (gatesByProject.get(p.id) || []).length;
      // Skip methods with gates disabled and no gate rows (e.g. sprint-only Agile).
      if (!orgPhases.length && !projectGateCount) continue;

      const projectStreams = (streamsByProject.get(p.id) || []).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      if (projectStreams.length > 0) {
        for (const s of projectStreams) {
          const gs = (gates as any[]).filter(
            (g) => g.stream_id === s.id || (!g.stream_id && g.project_id === p.id && s.is_default),
          );
          if (!gs.length && !orgPhases.length) continue;
          const { current, next } = resolveCurrentAndNextGate(gs, orgPhases);
          const phase = resolveCurrentStage(p, gs, orgPhases);
          rows.push({
            key: `${p.id}:${s.id}`,
            project: p,
            streamLabel: formatStreamLabel(s),
            streamRef: formatProjectStreamRef(p, s),
            current,
            next,
            phase,
            rag: s.rag || p.rag,
          });
        }
      } else {
        const gs = gatesByProject.get(p.id) || [];
        if (!gs.length && !orgPhases.length) continue;
        const { current, next } = resolveCurrentAndNextGate(gs, orgPhases);
        const phase = resolveCurrentStage(p, gs, orgPhases);
        rows.push({
          key: p.id,
          project: p,
          streamLabel: null,
          streamRef: null,
          current,
          next,
          phase,
          rag: p.rag,
        });
      }
    }
    return rows;
  }, [projects, gatesByProject, phasesForProject, streams, gates]);

  const columns: ColumnarColumn<(typeof register)[number]>[] = useMemo(
    () => [
      {
        key: "project",
        label: "Project",
        getValue: (r) => r.project.name || r.project.project_code || "",
      },
      {
        key: "stream",
        label: "Stream",
        getValue: (r) => r.streamLabel || "",
      },
      {
        key: "streamRef",
        label: "Project · Stream",
        getValue: (r) => r.streamRef || r.project.project_code || "",
      },
      {
        key: "program",
        label: "Program",
        getValue: (r) => r.project.program || "",
      },
      {
        key: "sponsor",
        label: "Sponsor",
        getValue: (r) => r.project.sponsor || "",
      },
      {
        key: "rag",
        label: "RAG",
        getValue: (r) => r.rag || "",
      },
      {
        key: "phase",
        label: "Current Phase",
        getValue: (r) => r.phase || "",
      },
      {
        key: "currentGate",
        label: "Current Gate",
        getValue: (r) => r.current?.gate_name || "",
      },
      {
        key: "currentStatus",
        label: "Current Status",
        getValue: (r) => r.current?.status || "",
      },
      {
        key: "nextGate",
        label: "Next Gate",
        getValue: (r) => r.next?.gate_name || (r.next ? "" : "All complete"),
      },
      {
        key: "nextPlanned",
        label: "Next Planned Date",
        getValue: (r) => r.next?.planned_date || "",
      },
      {
        key: "nextStatus",
        label: "Next Status",
        getValue: (r) => r.next?.status || "",
      },
      {
        key: "checklist",
        label: "Next checklist",
        getValue: (r) => (r.next ? summaryForGate(r.next).label : ""),
      },
    ],
    [summaryForGate],
  );

  const table = useColumnarTable(register, columns);

  const blockedNextCount = useMemo(
    () =>
      register.filter(
        (r) => r.next && approvalBlockedReason(summaryForGate(r.next)),
      ).length,
    [register, summaryForGate],
  );

  return (
    <div>
      <PageHeading
        icon="🚦"
        title="Stage Gates"
        subtitle="Stream / project governance — checklists must be complete before Approve"
        actions={
          <Link
            to="/app/stage-gate-config"
            className="text-xs font-medium text-primary hover:underline"
          >
            Configure gates & checklists →
          </Link>
        }
      />

      {projects.length === 0 && (
        <div className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm" role="status">
          <p className="font-medium text-foreground">Data not available</p>
          <p className="mt-1 text-muted-foreground">
            No projects in this organisation yet. Seed sample portfolio data or create a project
            before stage gates can appear.
          </p>
        </div>
      )}

      <SectionFrame>
        <SectionTitle>Gate KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <KpiCard label="Total Gates" value={total} />
          <KpiCard label="Approved" value={approved} />
          <KpiCard label="In Review" value={inReview} />
          <KpiCard label="Pending" value={pending} />
          <KpiCard label="Overdue" value={overdue} />
          <KpiCard
            label="Next gates blocked"
            value={blockedNextCount}
            accent={blockedNextCount ? "#f59e0b" : "#22c55e"}
          />
        </div>
      </SectionFrame>

      <SectionFrame>
        {distribution.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-xs text-muted-foreground">
            No gates yet. Configure gates in{" "}
            <Link to="/app/stage-gate-config" className="font-medium text-primary hover:underline">
              Stage Gate Configuration
            </Link>{" "}
            and add them to projects.
          </div>
        ) : (
          <ExpandableChart title="Gate Distribution" heightClass="h-72">
            <BarChart data={distribution} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
              <XAxis
                dataKey="gate"
                fontSize={11}
                angle={-15}
                textAnchor="end"
                interval={0}
                height={60}
              />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend verticalAlign="top" height={28} />
              {["Approved", "In Review", "Pending", "On Hold", "Rejected"].map((s) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="s"
                  fill={STATUS_COLORS[s]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ExpandableChart>
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stage Gate Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search stage gate register…"
        />
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
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                    {table.total === 0 ? "No stage gate rows yet." : "No rows match filters"}
                  </td>
                </tr>
              ) : (
                table.rows.map(({ key, project, streamLabel, streamRef, current, next, phase, rag }) => (
                  <tr key={key}>
                    <td>
                      <div className="leading-tight">
                        <div className="font-medium">{project.name}</div>
                        {project.project_code ? (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {project.project_code}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{streamLabel || "—"}</td>
                    <td className="font-mono text-[11px]">
                      {streamRef || project.project_code || "—"}
                    </td>
                    <td>{project.program || "—"}</td>
                    <td>{project.sponsor || "—"}</td>
                    <td>
                      <RagChip rag={rag} />
                    </td>
                    <td className="font-medium">{phase || "—"}</td>
                    <td>{current?.gate_name || "—"}</td>
                    <td>
                      {current ? (
                        <span
                          className="rounded px-2 py-0.5 text-[11px] text-white"
                          style={{
                            background: STATUS_COLORS[current.status || "Pending"] || "#94a3b8",
                          }}
                        >
                          {current.status || "Pending"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="font-medium">
                      {next?.gate_name || (
                        <span className="text-muted-foreground">All complete</span>
                      )}
                    </td>
                    <td>{next?.planned_date || "—"}</td>
                    <td>
                      {next ? (
                        <div className="flex flex-col gap-1">
                          <select
                            className="st-input !py-0.5 !text-xs"
                            value={next.status || "Pending"}
                            onChange={(e) =>
                              setGateStatus.mutate({
                                id: next.id,
                                status: e.target.value,
                                projectId: project.id,
                              })
                            }
                          >
                            {["Pending", "In Review", "Approved", "On Hold", "Rejected"].map(
                              (s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ),
                            )}
                          </select>
                          <button
                            type="button"
                            className="text-left text-[10px] font-medium text-primary hover:underline"
                            onClick={() => setChecklistGateId(next.id)}
                          >
                            Open checklist
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {next ? (
                        <GateChecklistBadge summary={summaryForGate(next)} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>

      <SectionFrame id="gate-checklist">
        <SectionTitle>Gate checklist &amp; evidence</SectionTitle>
        <select
          className="st-input mb-3 max-w-xl"
          value={checklistGateId}
          onChange={(e) => setChecklistGateId(e.target.value)}
        >
          <option value="">— Select a stage gate —</option>
          {gates.map((g: any) => {
            const p = projects.find((x: any) => x.id === g.project_id) as any;
            const sum = summaryForGate(g);
            return (
              <option key={g.id} value={g.id}>
                {(p?.project_code || "?") +
                  " · " +
                  (g.gate_name || "Gate") +
                  " · " +
                  (g.status || "Pending") +
                  (sum.total ? ` · ${sum.label}` : "")}
              </option>
            );
          })}
        </select>
        {checklistGateId ? (
          (() => {
            const g = gates.find((x: any) => x.id === checklistGateId) as any;
            if (!g) return null;
            return (
              <StageGateChecklistPanel
                stageGateId={g.id}
                gateName={g.gate_name || "Gate"}
                projectId={g.project_id}
                currentStatus={g.status}
              />
            );
          })()
        ) : (
          <p className="text-sm text-muted-foreground">
            Pick a gate (or use Open checklist on the register) to complete required items and
            attach evidence. Required items block Approve.
          </p>
        )}
      </SectionFrame>
    </div>
  );
}
