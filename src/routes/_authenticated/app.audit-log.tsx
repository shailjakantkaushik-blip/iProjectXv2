import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { exportOrgAuditEvidence } from "@/lib/compliance-export";
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
import { Input } from "@/components/ui/input";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;
  const allowed = isAdmin(roles);
  const [entityType, setEntityType] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const onExportEvidence = async () => {
    setExporting(true);
    try {
      await exportOrgAuditEvidence({
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        orgName: organization?.name ?? null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

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
    enabled: !!orgId && allowed,
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

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Audit log restricted</h1>
        <p className="text-sm text-muted-foreground">
          Organisation audit events are available to org admins only. Contact your administrator if
          you need access.
        </p>
        <Button asChild variant="outline">
          <Link to="/app">Back to home</Link>
        </Button>
      </div>
    );
  }

  return (
    <PageExport name="Audit_Log" title="Audit Log">
      <PageHeading
        title="Audit Log"
        subtitle="Admin-only trail of governance and privileged actions in this organisation"
      />

      <SectionFrame>
        <SectionTitle>Auditor evidence</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          One-click Excel pack for certification (up to 10,000 rows). Optional dates narrow the
          period; leave blank for the latest events. Screen preview below is capped at 500.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              className="w-40"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              className="w-40"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <Button type="button" onClick={onExportEvidence} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-4 w-4" />
            )}
            Export for auditors
          </Button>
        </div>
      </SectionFrame>

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
            No audit events yet. Role changes, user admin actions, and governed updates will appear
            here.
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
