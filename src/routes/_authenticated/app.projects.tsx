import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEditProjects, isAdmin } from "@/lib/auth-context";
import { useCapabilityPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionFrame, SectionTitle, PageHeading, KpiCard, RagChip } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { ExportableChart } from "@/components/chart-export";
import { EditableCell } from "@/components/editable-cell";
import { Plus, Upload, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { downloadTemplate, exportProjects, parseWorkbook } from "@/lib/excel";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  Legend,
  CartesianGrid,
} from "recharts";
import { RAG_COLORS, PRIORITY_COLORS, CHART_SERIES } from "@/lib/chart-theme";
import { ExpandableChart } from "@/components/expandable-chart";
import { PageLoading } from "@/components/page-loading";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/app/projects")({
  component: ProjectsList,
});

const PROGRAM_COLORS = CHART_SERIES;

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

function ProjectsList() {
  const { organization, roles, loading: authLoading } = useAuth();
  const canEdit = canEditProjects(roles);
  const admin = isAdmin(roles);
  const canUploadTemplate = useCapabilityPermission("template_upload").canEdit;
  const [prog, setProg] = useState("All");
  const [ragF, setRagF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const orgId = organization?.id;
  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      return data ?? [];
    },
    // Wait for org — a disabled query is not "loading", so without this gate
    // the register briefly renders as empty until refresh.
    enabled: !!orgId,
    retry: 2,
    staleTime: 15_000,
    refetchOnMount: "always",
  });

  const programs = useMemo(
    () =>
      Array.from(new Set(projects.map((p: any) => p.program).filter(Boolean))).sort() as string[],
    [projects],
  );
  const statuses = useMemo(
    () =>
      Array.from(new Set(projects.map((p: any) => p.status).filter(Boolean))).sort() as string[],
    [projects],
  );

  const filtered = useMemo(
    () =>
      projects.filter(
        (p: any) =>
          (prog === "All" || p.program === prog) &&
          (ragF === "All" || p.rag === ragF) &&
          (statusF === "All" || p.status === statusF),
      ),
    [projects, prog, ragF, statusF],
  );

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      { key: "project_code", label: "Project ID" },
      { key: "name", label: "Project Name" },
      { key: "portfolio", label: "Portfolio" },
      { key: "program", label: "Program" },
      { key: "sponsor", label: "Sponsor" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "rag", label: "RAG" },
      { key: "current_phase", label: "Current Phase" },
      { key: "delivery_method", label: "Method" },
      { key: "budget", label: "Budget", getValue: (p) => Number(p.budget || 0) },
      {
        key: "capex_incurred",
        label: "Incurred",
        getValue: (p) => Number(p.capex_incurred || 0),
      },
    ],
    [],
  );

  const table = useColumnarTable(filtered, columns);

  const onImport = async (file: File) => {
    if (!organization) return;
    setBusy(true);
    try {
      const rows = await parseWorkbook(file);
      if (rows.length === 0) return toast.error("No rows found");
      const payload = rows.map((r) => ({ ...r, org_id: organization.id }));
      const { error } = await supabase.from("projects").insert(payload as never);
      if (error) throw error;
      toast.success(`Imported ${rows.length} projects`);
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // KPIs
  const totalBudget = filtered.reduce((s, p: any) => s + Number(p.budget || 0), 0);
  const capexIncurred = filtered.reduce((s, p: any) => s + Number(p.capex_incurred || 0), 0);
  const active = filtered.filter((p: any) => p.status === "In Progress").length;
  const completed = filtered.filter((p: any) => p.status === "Completed").length;
  const atRisk = filtered.filter((p: any) => p.rag === "Red" || p.rag === "Amber").length;
  const utilPct = totalBudget > 0 ? Math.round((capexIncurred / totalBudget) * 100) : 0;

  // Charts
  const ragData = ["Green", "Amber", "Red"]
    .map((r) => ({
      name: r,
      value: filtered.filter((p: any) => p.rag === r).length,
      color: RAG_COLORS[r],
    }))
    .filter((d) => d.value > 0);

  const byProgram = useMemo(() => {
    const m = new Map<string, { name: string; count: number; budget: number }>();
    filtered.forEach((p: any) => {
      const k = p.program || "Unassigned";
      const cur = m.get(k) || { name: k, count: 0, budget: 0 };
      cur.count += 1;
      cur.budget += Number(p.budget || 0);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.budget - a.budget);
  }, [filtered]);

  const byPriority = useMemo(() => {
    const order = ["P4 - Low", "P3 - Medium", "P2 - High", "P1 - Critical"];
    const m = new Map<string, number>();
    filtered.forEach((p: any) => {
      const k = p.priority || "Unassigned";
      m.set(k, (m.get(k) || 0) + 1);
    });
    const rank = (n: string) => {
      const i = order.indexOf(n);
      return i === -1 ? order.length : i;
    };
    return Array.from(m, ([name, count]) => ({
      name,
      count,
      color: PRIORITY_COLORS[name] || "#94a3b8",
    })).sort((a, b) => rank(a.name) - rank(b.name));
  }, [filtered]);

  if (authLoading || !orgId || (isLoading && projects.length === 0)) {
    return <PageLoading label="Loading projects…" />;
  }
  if (isError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load projects{error instanceof Error ? `: ${error.message}` : "."}
        </p>
        <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  }

  return (
    <PageExport name="Project_Register" title="Project Register">
      <PageHeading
        icon="📁"
        title="Project Register"
        subtitle="Full portfolio inventory with filters, KPIs & analytics."

        actions={
          <div className="flex flex-wrap gap-2">
            {canUploadTemplate && (
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <FileDown className="mr-2 h-4 w-4" />
                Template
              </Button>
            )}
            {canUploadTemplate && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportProjects(filtered)}
              disabled={filtered.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            {(admin || canEdit) && (
              <Link to="/app/projects/new">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <SectionFrame>
        <SectionTitle>Filters</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Select value={prog} onValueChange={setProg}>
            <SelectTrigger>
              <SelectValue placeholder="Program" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All programs</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ragF} onValueChange={setRagF}>
            <SelectTrigger>
              <SelectValue placeholder="RAG" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All RAG</SelectItem>
              <SelectItem value="Green">Green</SelectItem>
              <SelectItem value="Amber">Amber</SelectItem>
              <SelectItem value="Red">Red</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Register KPIs</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Projects" value={filtered.length} accent="#3b82f6" />
          <KpiCard label="Active" value={active} accent="#06b6d4" />
          <KpiCard label="Completed" value={completed} accent="#22c55e" />
          <KpiCard label="At Risk" value={atRisk} accent="#f59e0b" />
          <KpiCard label="Total Budget" value={money(totalBudget)} accent="#8b5cf6" />
          <KpiCard
            label="Utilisation"
            value={`${utilPct}%`}
            sub={money(capexIncurred)}
            accent="#ec4899"
          />
        </div>
      </SectionFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionFrame>
          <ExpandableChart
            title="Portfolio Health (RAG)"
            heightClass="h-56"
            legend={
              <div className="mt-1 flex justify-center gap-3 text-[11px]">
                {ragData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    <span>
                      {d.name} {d.value}
                    </span>
                  </div>
                ))}
              </div>
            }
          >
            <PieChart>
              <Pie
                data={ragData}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={75}
                paddingAngle={2}
              >
                {ragData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ExpandableChart>
        </SectionFrame>

        <SectionFrame className="lg:col-span-2">
          <ExpandableChart title="Budget by Program" heightClass="h-56">
            <BarChart data={byProgram} margin={{ top: 15, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={money} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="budget" radius={[4, 4, 0, 0]}>
                {byProgram.map((_, i) => (
                  <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} />
                ))}
                <LabelList
                  dataKey="budget"
                  position="top"
                  formatter={(v: number) => money(v)}
                  style={{ fontSize: 10, fill: "#475569" }}
                />
              </Bar>
            </BarChart>
          </ExpandableChart>
        </SectionFrame>
      </div>

      <SectionFrame>
        <ExpandableChart title="By Priority" heightClass="h-48">
          <BarChart
            data={byPriority}
            layout="vertical"
            margin={{ top: 5, right: 24, left: 4, bottom: 5 }}
          >
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10 }}
              width={72}
              tickFormatter={(v: string) => (v?.length > 12 ? `${v.slice(0, 11)}…` : v)}
            />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {byPriority.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fontSize: 11, fill: "#334155" }}
              />
            </Bar>
          </BarChart>
        </ExpandableChart>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>
          Portfolio Register ({table.rows.length}
          {table.rows.length !== table.total ? ` of ${table.total}` : ""})
          {isFetching ? (
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">Updating…</span>
          ) : null}
        </SectionTitle>
        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
          onClear={table.clearAll}
          placeholder="Search portfolio register…"
        />
        {table.total === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No projects match.{" "}
            {admin ? "Import from Excel or click New." : "Ask your admin to add projects."}
          </div>
        ) : table.rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No projects match column filters.
          </div>
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
                      align={col.key === "budget" || col.key === "capex_incurred" ? "right" : "left"}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11px]">
                      {p.project_code ? (
                        <Link
                          to="/app/project-infographic"
                          search={{ pid: p.id }}
                          className="text-primary hover:underline"
                        >
                          {p.project_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <Link
                          to="/app/projects/$id"
                          params={{ id: p.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{p.name}</span>
                      )}
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="portfolio"
                        value={p.portfolio}
                        type="select"
                        options={[
                          { label: "Business Strategic", value: "Business Strategic" },
                          { label: "IT Strategic", value: "IT Strategic" },
                          { label: "CAPEX", value: "CAPEX" },
                          { label: "Unfunded", value: "Unfunded" },
                        ]}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="program"
                        value={p.program}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="sponsor"
                        value={p.sponsor}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="priority"
                        value={p.priority}
                        type="select"
                        options={[
                          { label: "P1 - Critical", value: "P1 - Critical" },
                          { label: "P2 - High", value: "P2 - High" },
                          { label: "P3 - Medium", value: "P3 - Medium" },
                          { label: "P4 - Low", value: "P4 - Low" },
                        ]}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="status"
                        value={p.status}
                        type="select"
                        options={[
                          { label: "Not Started", value: "Not Started" },
                          { label: "In Progress", value: "In Progress" },
                          { label: "On Hold", value: "On Hold" },
                          { label: "Completed", value: "Completed" },
                          { label: "Cancelled", value: "Cancelled" },
                        ]}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="rag"
                        value={p.rag}
                        type="select"
                        options={[
                          { label: "Green", value: "Green" },
                          { label: "Amber", value: "Amber" },
                          { label: "Red", value: "Red" },
                        ]}
                        invalidateKeys={["projects"]}
                        display={(v) => <RagChip rag={v} />}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="current_phase"
                        value={p.current_phase}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td>
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="delivery_method"
                        value={p.delivery_method}
                        type="select"
                        options={[
                          { label: "Waterfall", value: "Waterfall" },
                          { label: "Agile", value: "Agile" },
                          { label: "Hybrid", value: "Hybrid" },
                        ]}
                        invalidateKeys={["projects"]}
                      />
                    </td>
                    <td className="text-right tabular-nums">
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="budget"
                        value={p.budget}
                        type="number"
                        invalidateKeys={["projects"]}
                        display={(v) => money(Number(v || 0))}
                      />
                    </td>
                    <td className="text-right tabular-nums">
                      <EditableCell
                        table="projects"
                        rowId={p.id}
                        field="capex_incurred"
                        value={p.capex_incurred}
                        type="number"
                        invalidateKeys={["projects"]}
                        display={(v) => money(Number(v || 0))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </PageExport>
  );
}
