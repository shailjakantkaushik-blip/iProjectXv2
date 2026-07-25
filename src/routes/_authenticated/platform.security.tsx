import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { exportPlatformSecurityEvidence } from "@/lib/compliance-export";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/platform/security")({
  component: PlatformSecurityPage,
});

function PlatformSecurityPage() {
  const { roles } = useAuth();
  const allowed = isPlatformAdmin(roles);
  const [eventType, setEventType] = useState("all");
  const [emailQ, setEmailQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const onExportEvidence = async () => {
    setExporting(true);
    try {
      await exportPlatformSecurityEvidence({
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["platform_security_events"],
    queryFn: async () => {
      const { data, error: err } = await (supabase as any)
        .from("security_events")
        .select("id,created_at,event_type,summary,email,org_id,actor_user_id,meta")
        .order("created_at", { ascending: false })
        .limit(500);
      if (err) throw err;
      return data ?? [];
    },
    enabled: allowed,
  });

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const e of events as any[]) if (e.event_type) s.add(e.event_type);
    return Array.from(s).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = emailQ.trim().toLowerCase();
    return (events as any[]).filter((e) => {
      if (eventType !== "all" && e.event_type !== eventType) return false;
      if (q && !(e.email || "").toLowerCase().includes(q) && !(e.summary || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [events, eventType, emailQ]);

  if (!allowed) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Platform admin access required.</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security events</h1>
        <p className="text-sm text-muted-foreground">
          Platform-only stream: logins, logouts, failed logins, and other security actions across
          tenants.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auditor evidence</CardTitle>
          <CardDescription>
            One-click Excel pack for certification (up to 10,000 rows). Optional dates narrow the
            period. Screen preview below is capped at 500.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Last 500 rows from `security_events`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="max-w-xs"
              placeholder="Filter email / summary…"
              value={emailQ}
              onChange={(e) => setEmailQ(e.target.value)}
            />
          </div>

          {isLoading ? (
            <PageLoading label="Loading security events…" fullScreen={false} />
          ) : error ? (
            <p className="text-sm text-destructive">
              {(error as Error).message}. Ensure the `security_events` migration has been applied.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="border-b border-border/60 align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                        {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.event_type}</td>
                      <td className="py-2 pr-3 text-xs">{e.email ?? "—"}</td>
                      <td className="py-2 text-sm">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
