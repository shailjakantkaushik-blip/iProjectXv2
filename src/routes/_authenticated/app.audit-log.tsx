import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/page-loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [entityType, setEntityType] = useState("All");
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (events as any[]).filter((e) => {
      if (entityType !== "All" && e.entity_type !== entityType) return false;
      if (!needle) return true;
      return (
        String(e.summary ?? "").toLowerCase().includes(needle) ||
        String(e.action ?? "").toLowerCase().includes(needle) ||
        String(e.entity_type ?? "").toLowerCase().includes(needle)
      );
    });
  }, [events, entityType, q]);

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
          <Input
            className="max-w-xs"
            placeholder="Search summary / action…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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

        {isLoading ? (
          <PageLoading label="Loading audit log…" fullScreen={false} size="sm" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audit events yet. Decision outcome changes and other governed actions will appear
            here after the advanced PMO migration is applied.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table w-full">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Entity</th>
                  <th>Action</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => (
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
