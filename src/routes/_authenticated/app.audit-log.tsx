import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
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

export const Route = createFileRoute("/_authenticated/app/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [entityType, setEntityType] = useState("All");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["audit_events", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("audit_events" as any)
          .select("*")
          .eq("org_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(500)
      ).data ?? [],
    enabled: !!orgId,
  });

  const types = useMemo(() => {
    const s = new Set<string>();
    (events as any[]).forEach((e) => {
      if (e.entity_type) s.add(e.entity_type);
    });
    return Array.from(s).sort();
  }, [events]);

  const pageFiltered = useMemo(() => {
    return (events as any[]).filter((e) => {
      if (entityType !== "All" && e.entity_type !== entityType) return false;
      return true;
    });
  }, [events, entityType]);

  const columns: ColumnarColumn<any>[] = useMemo(
    () => [
      {
        key: "created_at",
        label: "When",
        getValue: (e) => (e.created_at ? new Date(e.created_at).toLocaleString() : ""),
      },
      { key: "entity_type", label: "Entity" },
      { key: "action", label: "Action" },
      { key: "summary", label: "Summary" },
    ],
    [],
  );
  const table = useColumnarTable(pageFiltered, columns);

  const last24h = (events as any[]).filter((e) => {
    const t = new Date(e.created_at).getTime();
    return Date.now() - t < 24 * 60 * 60 * 1000;
  }).length;

  return (
    <PageExport name="Audit_Log" title="Audit Log">
      <PageHeading
        title="Audit Log"
        subtitle="Immutable trail of governance and system actions across the organisation"
      />

      <SectionFrame>
        <SectionTitle>Activity</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="Events (loaded)" value={events.length} />
          <KpiCard label="Last 24 hours" value={last24h} />
          <KpiCard label="Entity types" value={types.length} />
        </div>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All entities</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ColumnarToolbar
          globalQ={table.globalQ}
          onGlobalQ={table.setGlobalQ}
          shown={table.rows.length}
          total={table.total}
          dirty={table.isDirty}
            onClear={table.clearAll}
          placeholder="Search audit log…"
        />

        {isLoading ? (
          <PageLoading label="Loading audit log…" fullScreen={false} size="sm" />
        ) : table.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audit events yet. Decision outcome changes and other governed actions will appear
            here after the advanced PMO migration is applied.
          </p>
        ) : table.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events match filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table w-full">
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
                {table.rows.map((e: any) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="text-xs font-medium uppercase tracking-wide">
                      {e.entity_type ?? "—"}
                    </td>
                    <td className="font-mono text-xs">{e.action ?? "—"}</td>
                    <td className="text-sm">{e.summary ?? "—"}</td>
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
