import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, ListTodo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WORK_ITEMS_SELECT } from "@/lib/query-selects";
import { formatStreamLabel } from "@/lib/project-streams";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

type StreamLike = {
  id: string;
  name?: string | null;
  code?: string | null;
  sort_order?: number | null;
};

function CompletionBar({
  label,
  pct,
  done,
  total,
}: {
  label: string;
  pct: number;
  done: number;
  total: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {clamped.toFixed(0)}% · {done}/{total} done
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function ProjectInfographicWorkItems({
  projectId,
  projectStreams = [],
}: {
  projectId: string;
  projectStreams?: StreamLike[];
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [depPred, setDepPred] = useState("");
  const [depSucc, setDepSucc] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["work_items", orgId, "infographic", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select(WORK_ITEMS_SELECT as "*")
        .eq("org_id", orgId!)
        .eq("project_id", projectId)
        .order("sort_order")
        .order("planned_end");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId && !!projectId,
  });

  const linksQ = useQuery({
    queryKey: ["work_item_links", orgId, "infographic", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_item_links" as any)
        .select("id,predecessor_id,successor_id,link_type,lag_days")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        predecessor_id: string;
        successor_id: string;
        link_type: string;
        lag_days: number | null;
      }[];
    },
    enabled: !!orgId && !!projectId,
  });

  const streamById = useMemo(() => new Map(projectStreams.map((s) => [s.id, s])), [projectStreams]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const wiIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const scopedLinks = useMemo(
    () =>
      (linksQ.data ?? []).filter((l) => wiIds.has(l.predecessor_id) && wiIds.has(l.successor_id)),
    [linksQ.data, wiIds],
  );

  const predecessorsByItem = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of scopedLinks) {
      const list = m.get(l.successor_id) || [];
      list.push(l.predecessor_id);
      m.set(l.successor_id, list);
    }
    return m;
  }, [scopedLinks]);

  const activeItems = useMemo(
    () => items.filter((i) => String(i.status || "") !== "Cancelled"),
    [items],
  );
  const doneCount = activeItems.filter((i) => i.status === "Done").length;
  const blockedCount = activeItems.filter((i) => i.status === "Blocked").length;
  const inProgressCount = activeItems.filter((i) => i.status === "In Progress").length;

  const avgPct = useMemo(() => {
    if (!activeItems.length) return 0;
    const sum = activeItems.reduce((acc, i) => {
      if (i.status === "Done") return acc + 100;
      const n = Number(i.percent_complete);
      return acc + (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
    }, 0);
    return sum / activeItems.length;
  }, [activeItems]);

  const statusDonePct = activeItems.length ? (doneCount / activeItems.length) * 100 : 0;

  const completionByStream = useMemo(() => {
    if (!projectStreams.length) return [];
    return [...projectStreams]
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          String(a.name || "").localeCompare(String(b.name || "")),
      )
      .map((stream) => {
        const lane = activeItems.filter(
          (i) => i.stream_id === stream.id || (!i.stream_id && (stream as any).is_default),
        );
        const done = lane.filter((i) => i.status === "Done").length;
        const pct = lane.length ? (done / lane.length) * 100 : 0;
        return {
          stream,
          total: lane.length,
          done,
          pct,
        };
      })
      .filter((s) => s.total > 0);
  }, [projectStreams, activeItems]);

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "stream",
        label: "Stream",
        getValue: (i) => {
          const s = i.stream_id ? streamById.get(i.stream_id) : null;
          return s ? formatStreamLabel(s) : "";
        },
      },
      { key: "wbs_code", label: "WBS" },
      { key: "title", label: "Title" },
      {
        key: "depends_on",
        label: "Depends on",
        getValue: (i) =>
          (predecessorsByItem.get(i.id) || [])
            .map((pid) => {
              const p = itemById.get(pid);
              return p ? (p.wbs_code ? `${p.wbs_code} · ${p.title}` : p.title) : "";
            })
            .filter(Boolean)
            .join("; "),
      },
      { key: "status", label: "Status" },
      {
        key: "percent_complete",
        label: "%",
        getValue: (i) => String(i.status === "Done" ? 100 : Number(i.percent_complete) || 0),
      },
      { key: "owner", label: "Owner" },
      { key: "planned_end", label: "End" },
    ],
    [streamById, predecessorsByItem, itemById],
  );

  const table = useColumnarTable(items, columns);

  const addDependency = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      if (!depPred || !depSucc) throw new Error("Pick predecessor and successor");
      if (depPred === depSucc) throw new Error("A work item cannot depend on itself");
      const { error } = await supabase.from("work_item_links" as any).insert({
        org_id: orgId,
        predecessor_id: depPred,
        successor_id: depSucc,
        link_type: "FS",
        lag_days: 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_item_links", orgId] });
      toast.success("Dependency added");
      setDepPred("");
      setDepSucc("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDependency = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("work_item_links" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work_item_links", orgId] });
      toast.success("Dependency removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionFrame>
      <div className="mb-3 flex items-center gap-2">
        <ListTodo className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-800">Work Items</h2>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total" value={activeItems.length} />
        <KpiCard label="In progress" value={inProgressCount} />
        <KpiCard label="Blocked" value={blockedCount} />
        <KpiCard label="Done" value={doneCount} />
      </div>

      <div className="mb-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <CompletionBar
          label="Status completion"
          pct={statusDonePct}
          done={doneCount}
          total={activeItems.length}
        />
        <CompletionBar
          label="% complete (weighted)"
          pct={avgPct}
          done={doneCount}
          total={activeItems.length}
        />
        {completionByStream.length > 0 ? (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              By stream
            </div>
            {completionByStream.map((row) => (
              <CompletionBar
                key={row.stream.id}
                label={formatStreamLabel(row.stream)}
                pct={row.pct}
                done={row.done}
                total={row.total}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="register" className="w-full">
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
          <TabsTrigger
            value="register"
            className="rounded-none bg-transparent px-4 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
          >
            Register
          </TabsTrigger>
          <TabsTrigger
            value="deps"
            className="rounded-none bg-transparent px-4 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
          >
            <Link2 className="mr-1 h-3.5 w-3.5" />
            Dependencies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <SectionTitle>Project work register</SectionTitle>
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
            dirty={table.isDirty}
            onClear={table.clearAll}
            placeholder="Search work items…"
          />
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading work items…</p>
          ) : table.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No work items for this project yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table text-xs">
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
                  {table.rows.map((i) => {
                    const pct = i.status === "Done" ? 100 : Number(i.percent_complete) || 0;
                    return (
                      <tr key={i.id}>
                        <td>
                          {(() => {
                            const s = i.stream_id ? streamById.get(i.stream_id) : null;
                            return s ? formatStreamLabel(s) : "—";
                          })()}
                        </td>
                        <td className="font-mono">{i.wbs_code || "—"}</td>
                        <td>{i.title || "—"}</td>
                        <td className="max-w-[12rem] text-[11px]">
                          {String(
                            columns.find((c) => c.key === "depends_on")?.getValue?.(i) || "—",
                          )}
                        </td>
                        <td>{i.status || "—"}</td>
                        <td className="min-w-[7rem]">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-sky-500"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-[10px] text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td>{i.owner || "—"}</td>
                        <td>{i.planned_end || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="deps" className="mt-4 space-y-3">
          <SectionTitle>Work item dependencies</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Capture finish-to-start (FS) links between work items in this project. Critical-path
            analysis remains on Schedule — Critical Path.
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <select
              className="st-input"
              value={depPred}
              onChange={(e) => setDepPred(e.target.value)}
            >
              <option value="">— Predecessor —</option>
              {items.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.wbs_code ? `${w.wbs_code} · ` : ""}
                  {w.title}
                </option>
              ))}
            </select>
            <select
              className="st-input"
              value={depSucc}
              onChange={(e) => setDepSucc(e.target.value)}
            >
              <option value="">— Successor (depends on) —</option>
              {items.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.wbs_code ? `${w.wbs_code} · ` : ""}
                  {w.title}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={addDependency.isPending || !depPred || !depSucc}
              onClick={() => addDependency.mutate()}
            >
              {addDependency.isPending ? "Saving…" : "Add dependency"}
            </Button>
          </div>
          {scopedLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dependencies captured yet.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {scopedLinks.map((l) => {
                const pred = itemById.get(l.predecessor_id);
                const succ = itemById.get(l.successor_id);
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
                  >
                    <span>
                      <span className="font-medium">{pred?.title}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{succ?.title}</span>
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                        {l.link_type || "FS"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() => removeDependency.mutate(l.id)}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </SectionFrame>
  );
}
