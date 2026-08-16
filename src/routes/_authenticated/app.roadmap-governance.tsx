import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PROJECT_PORTFOLIO_SELECT, STAGE_GATE_DEFINITIONS_SELECT } from "@/lib/query-selects";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { explainRag } from "@/lib/explain-metric";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { CHART_SERIES } from "@/lib/chart-theme";
import { deliveryMethodsQueryKey, fetchDeliveryMethods } from "@/lib/delivery-methods";
import { buildStageGateFlows, type StageGateDefLike } from "@/lib/stage-gate-flow";

export const Route = createFileRoute("/_authenticated/app/roadmap-governance")({
  component: RoadmapGovPage,
});

const STAGE_COLORS = [
  "#94a3b8",
  "#60a5fa",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#15803d",
  "#0ea5e9",
  "#a855f7",
];

function RoadmapGovPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const {
    data: projects = [],
    isError: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_PORTFOLIO_SELECT as "*");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization,
    retry: 1,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select(STAGE_GATE_DEFINITIONS_SELECT as "*")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!organization,
  });

  const deliveryMethodsQ = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId,
  });
  const deliveryMethods = deliveryMethodsQ.data ?? [];
  const methodsReady = deliveryMethodsQ.isFetched;

  const active = projects.filter((p) => p.status !== "Completed" && p.status !== "Cancelled");
  const flows = useMemo(
    () =>
      methodsReady
        ? buildStageGateFlows(deliveryMethods, gateDefs as StageGateDefLike[], projects)
        : [],
    [deliveryMethods, gateDefs, projects, methodsReady],
  );

  const kpis = {
    inFlight: active.length,
    completed: projects.filter((p) => p.status === "Completed").length,
    goLiveNext30: projects.filter((p) => {
      if (!p.target_go_live) return false;
      const d = new Date(p.target_go_live);
      const now = new Date();
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      return d >= now && d <= in30;
    }).length,
    overdue: projects.filter((p) => {
      if (!p.end_date) return false;
      return new Date(p.end_date) < new Date() && p.status !== "Completed";
    }).length,
  };

  const columns: ColumnarColumn<Record<string, unknown>>[] = useMemo(
    () => [
      { key: "name", label: "Project" },
      { key: "program", label: "Program" },
      { key: "delivery_method", label: "Method" },
      { key: "current_phase", label: "Current Phase" },
      { key: "status", label: "Status" },
      { key: "rag", label: "RAG" },
      { key: "sponsor", label: "Sponsor" },
      { key: "target_go_live", label: "Target Go-Live" },
      { key: "end_date", label: "End" },
    ],
    [],
  );
  const table = useColumnarTable(projects, columns);

  return (
    <div>
      <PageHeading icon="🏛️">Governance — Stage Gates & Approvals</PageHeading>

      {(projectsError || projects.length === 0) && (
        <div
          className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-medium text-foreground">Data not available</p>
          <p className="mt-1 text-muted-foreground">
            {projectsError
              ? "Project data could not be loaded for this page."
              : "No projects yet — stage-gate governance will populate once projects exist."}
          </p>
          {projectsError && (
            <button
              type="button"
              className="st-btn-primary mt-3"
              onClick={() => void refetchProjects()}
            >
              Try again
            </button>
          )}
        </div>
      )}

      <SectionFrame>
        <SectionTitle>Governance KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="In-Flight" value={kpis.inFlight} />
          <KpiCard label="Completed" value={kpis.completed} />
          <KpiCard label="Go-Live in 30d" value={kpis.goLiveNext30} />
          <KpiCard label="Overdue" value={kpis.overdue} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Stage-Gate Flow (active projects)</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Each delivery method has its own gates. A project is counted only on its method’s graph,
          against that method’s template.{" "}
          <Link to="/app/stage-gate-config" className="font-medium text-primary hover:underline">
            Configure methods &amp; gates
          </Link>
        </p>
        <div className="space-y-6">
          {!methodsReady && (
            <p className="text-sm text-muted-foreground">Loading delivery-method graphs…</p>
          )}
          {methodsReady && flows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No delivery-method gate templates yet.{" "}
              <Link
                to="/app/stage-gate-config"
                className="font-medium text-primary hover:underline"
              >
                Configure methods &amp; gates
              </Link>
            </p>
          )}
          {flows.map((flow, i) => {
            const fill = CHART_SERIES[i % CHART_SERIES.length];
            return (
              <div key={flow.methodId}>
                <ExpandableChart
                  title={`${flow.methodName} · ${flow.activeCount} active`}
                  heightClass="h-64"
                >
                  <BarChart data={flow.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
                    <XAxis
                      dataKey="stage"
                      fontSize={10}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" name="Active projects" radius={[4, 4, 0, 0]} fill={fill} />
                  </BarChart>
                </ExpandableChart>
                <div
                  className="mt-2 grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(flow.stages.length, 6)}, minmax(0, 1fr))`,
                  }}
                >
                  {flow.stages.map((s, gi) => (
                    <div
                      key={`${flow.methodId}-${s}`}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded"
                        style={{ background: STAGE_COLORS[gi % STAGE_COLORS.length] }}
                      />
                      <span className="truncate" title={s}>
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Governance Register</SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search governance register…"
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
              {table.rows.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.program || "—"}</td>
                  <td>{p.delivery_method || "—"}</td>
                  <td>{p.current_phase || "—"}</td>
                  <td>{p.status}</td>
                  <td>
                    <RagChip rag={p.rag} explain={explainRag({ rag: p.rag, source: "register" })} />
                  </td>
                  <td>{p.sponsor || "—"}</td>
                  <td>{p.target_go_live || "—"}</td>
                  <td>{p.end_date || "—"}</td>
                </tr>
              ))}
              {table.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No projects match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
