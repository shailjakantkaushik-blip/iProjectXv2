import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ExpandableChart } from "@/components/expandable-chart";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/roadmap-governance")({
  component: RoadmapGovPage,
});

/** Fallback when org has no active stage_gate_definitions (matches stage-gate-config DEFAULTS). */
const STAGE_DEFAULTS = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
];

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

/** Map a project phase to one stage: exact lowercase match first, else fuzzy includes. */
function resolveStage(phase: string | null | undefined, stages: string[]): string | null {
  const p = (phase || "").trim().toLowerCase();
  if (!p) return null;
  const exact = stages.find((s) => s.trim().toLowerCase() === p);
  if (exact) return exact;
  // Prefer longest fuzzy match to avoid "Business Case" hitting multiple gates
  let best: string | null = null;
  let bestLen = 0;
  for (const s of stages) {
    const sl = s.trim().toLowerCase();
    if (!sl) continue;
    if (p.includes(sl) || sl.includes(p)) {
      if (sl.length > bestLen) {
        best = s;
        bestLen = sl.length;
      }
    }
  }
  return best;
}

function RoadmapGovPage() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!organization,
  });

  const { data: gateDefs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select("*")
          .eq("org_id", organization!.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!organization,
  });

  const stages = useMemo(() => {
    const fromDefs = (gateDefs as any[]).map((d) => d.gate_name).filter(Boolean);
    return fromDefs.length > 0 ? fromDefs : [...STAGE_DEFAULTS];
  }, [gateDefs]);

  const active = projects.filter((p) => p.status !== "Completed" && p.status !== "Cancelled");
  const stageCounts = useMemo(() => {
    const counts = new Map(stages.map((s) => [s, 0]));
    for (const p of active) {
      const matched = resolveStage(p.current_phase, stages);
      if (matched) counts.set(matched, (counts.get(matched) || 0) + 1);
    }
    return stages.map((s) => ({ stage: s, count: counts.get(s) || 0 }));
  }, [active, stages]);

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

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Project" },
      { key: "program", label: "Program" },
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
        <ExpandableChart title="Stage-Gate Flow (active projects)" heightClass="h-64">
          <BarChart data={stageCounts}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,18,32,0.08)" />
            <XAxis dataKey="stage" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#1d4ed8" />
          </BarChart>
        </ExpandableChart>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-2 text-[11px]">
              <span
                className="h-3 w-3 shrink-0 rounded"
                style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }}
              />
              <span className="truncate" title={s}>
                {s}
              </span>
            </div>
          ))}
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
                  <td>{p.current_phase || "—"}</td>
                  <td>{p.status}</td>
                  <td>
                    <RagChip rag={p.rag} />
                  </td>
                  <td>{p.sponsor || "—"}</td>
                  <td>{p.target_go_live || "—"}</td>
                  <td>{p.end_date || "—"}</td>
                </tr>
              ))}
              {table.rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-sm text-muted-foreground">
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
