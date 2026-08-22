import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { FlaskConical, Play, Copy } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { runPlatformCommercialTests } from "@/lib/platform-testing.functions";
import type { PlatformCheckResult, PlatformSuiteReport } from "@/lib/platform-commercial-suite";

export const Route = createFileRoute("/_authenticated/platform/testing")({
  component: PlatformTestingPage,
});

function statusClass(status: PlatformCheckResult["status"]) {
  if (status === "pass") return "bg-emerald-100 text-emerald-800";
  if (status === "fail") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function PlatformTestingPage() {
  const { roles } = useAuth();
  const allowed = isPlatformAdmin(roles);
  const runSuite = useServerFn(runPlatformCommercialTests);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<PlatformSuiteReport | null>(null);

  const groups = useMemo(() => {
    if (!report) return [];
    const order = ["Engines", "Public", "Anon RLS", "Platform data"];
    const map = new Map<string, PlatformCheckResult[]>();
    for (const check of report.checks) {
      const list = map.get(check.group) ?? [];
      list.push(check);
      map.set(check.group, list);
    }
    return order.filter((g) => map.has(g)).map((g) => ({ name: g, checks: map.get(g)! }));
  }, [report]);

  async function run() {
    setRunning(true);
    try {
      const next = await runSuite({ data: { origin: window.location.origin } });
      setReport(next);
      if (next.failed) toast.error(`${next.failed} check(s) failed — see results below`);
      else toast.success(`${next.passed} checks passed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suite failed to start");
    } finally {
      setRunning(false);
    }
  }

  async function copyReport() {
    if (!report) return;
    const lines = [
      `iProjectX platform commercial suite`,
      `Ran ${report.ranAt} against ${report.platformOrg.name || report.platformOrg.slug}`,
      `${report.passed} passed · ${report.failed} failed · ${report.skipped} skipped`,
      "",
      ...report.checks.map((c) => `${c.status.toUpperCase()}  [${c.group}] ${c.name} — ${c.detail} (${c.ms}ms)`),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Results copied");
  }

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Platform admin only. This page never runs against a customer organisation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Commercial testing"
          subtitle="One-click suite for the iProjectX platform organisation. Customer tenants are never queried."
        />
        <div className="flex gap-2">
          {report && (
            <Button variant="outline" size="sm" onClick={() => void copyReport()}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy results
            </Button>
          )}
          <Button size="sm" onClick={() => void run()} disabled={running}>
            {running ? (
              <FlaskConical className="mr-1.5 h-4 w-4 animate-pulse" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {running ? "Running…" : "Run tests"}
          </Button>
        </div>
      </div>

      <SectionFrame exportable={false}>
        <SectionTitle>Guardrail</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Every live data check is filtered to organisation slug <code>iprojectx</code>. Anon RLS
          checks prove tenant tables return zero rows without a session. This page is not a load
          test and does not write platform or customer rows.
        </p>
      </SectionFrame>

      {report && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{report.passed} passed</Badge>
          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">{report.failed} failed</Badge>
          <Badge variant="secondary">{report.skipped} skipped</Badge>
          <span className="text-muted-foreground">
            {report.platformOrg.name} · {new Date(report.ranAt).toLocaleString()}
          </span>
        </div>
      )}

      {groups.map((group) => (
        <SectionFrame key={group.name} exportable={false}>
          <SectionTitle>{group.name}</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Check</th>
                  <th className="py-2 pr-3 font-medium">Detail</th>
                  <th className="py-2 font-medium">ms</th>
                </tr>
              </thead>
              <tbody>
                {group.checks.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusClass(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium">{c.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.detail}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">{c.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      ))}

      {!report && !running && (
        <p className="text-sm text-muted-foreground">
          Click <strong>Run tests</strong> to execute engines, public pages, anon RLS, and iProjectX
          data checks.
        </p>
      )}
    </div>
  );
}
