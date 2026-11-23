import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Copy, Database, FlaskConical, Play } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { runPlatformCommercialTests } from "@/lib/platform-testing.functions";
import { previewPlatformSampleData, resetPlatformSampleData } from "@/lib/platform-sample-reset.functions";
import {
  ALL_PLATFORM_SUITE_KINDS,
  PLATFORM_SUITE_KINDS,
  type IssueSeverity,
  type PlatformCheckResult,
  type PlatformSuiteKind,
  type PlatformSuiteReport,
} from "@/lib/platform-commercial-suite";
import {
  PLATFORM_SAMPLE_CONFIRM,
  PLATFORM_SAMPLE_PACK_BLURBS,
  PLATFORM_SAMPLE_PACKS,
  SAMPLE_KEEP_SURFACES,
  type PlatformSamplePack,
  type SamplePreview,
  type SampleResetReport,
} from "@/lib/platform-sample-reset";

export const Route = createFileRoute("/_authenticated/platform/testing")({
  component: PlatformTestingPage,
});

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low"];

const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  critical: "bg-rose-700 text-white",
  high: "bg-rose-100 text-rose-800",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-slate-100 text-slate-700",
};

function statusClass(status: PlatformCheckResult["status"]) {
  if (status === "pass") return "bg-emerald-100 text-emerald-800";
  if (status === "fail") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function PlatformTestingPage() {
  const { roles } = useAuth();
  const allowed = isPlatformAdmin(roles);
  const runSuite = useServerFn(runPlatformCommercialTests);
  const previewSample = useServerFn(previewPlatformSampleData);
  const resetSample = useServerFn(resetPlatformSampleData);
  const [selected, setSelected] = useState<PlatformSuiteKind[]>([...ALL_PLATFORM_SUITE_KINDS]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<PlatformSuiteReport | null>(null);
  const [pack, setPack] = useState<PlatformSamplePack>(4);
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<SamplePreview | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetReport, setResetReport] = useState<SampleResetReport | null>(null);

  async function loadPreview() {
    try {
      setPreview(await previewSample());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load iProjectX counts");
    }
  }

  useEffect(() => {
    void loadPreview();
  }, []);

  const suiteGroups = useMemo(() => {
    if (!report) return [];
    const map = new Map<string, PlatformCheckResult[]>();
    for (const check of report.checks) {
      const key = PLATFORM_SUITE_KINDS.find((s) => s.id === check.suite)?.label ?? check.suite;
      const list = map.get(key) ?? [];
      list.push(check);
      map.set(key, list);
    }
    return [...map.entries()].map(([name, checks]) => ({ name, checks }));
  }, [report]);

  function toggle(kind: PlatformSuiteKind) {
    setSelected((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
  }

  async function run() {
    if (!selected.length) {
      toast.error("Select at least one suite");
      return;
    }
    setRunning(true);
    try {
      const next = await runSuite({ data: { origin: window.location.origin, suites: selected } });
      setReport(next);
      if (next.failed) toast.error(`${next.failed} issue(s) — grouped by criticality below`);
      else toast.success(`${next.passed} checks passed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suite failed to start");
    } finally {
      setRunning(false);
    }
  }

  async function resetLab() {
    if (confirm.trim().toLowerCase() !== PLATFORM_SAMPLE_CONFIRM) {
      toast.error("Type iprojectx to confirm");
      return;
    }
    setResetting(true);
    try {
      const next = await resetSample({ data: { pack, confirm } });
      setResetReport(next);
      setConfirm("");
      await loadPreview();
      toast.success(`Reset ${next.created.projects ?? pack} iProjectX projects`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function copyReport() {
    if (!report) return;
    const lines = [
      `iProjectX platform commercial suite`,
      `Suites: ${report.suites.join(", ")}`,
      `Ran ${report.ranAt} against ${report.platformOrg.name || report.platformOrg.slug}`,
      `${report.passed} passed · ${report.failed} failed`,
      `Issues: critical ${report.issueCounts.critical}, high ${report.issueCounts.high}, medium ${report.issueCounts.medium}, low ${report.issueCounts.low}`,
      "",
      ...SEVERITY_ORDER.flatMap((sev) => {
        const rows = report.issues.filter((i) => i.severity === sev);
        if (!rows.length) return [];
        return [`## ${sev.toUpperCase()}`, ...rows.map((i) => `- [${i.suite}] ${i.name} — ${i.detail}`), ""];
      }),
      "## All checks",
      ...report.checks.map((c) => `${c.status.toUpperCase()}  [${c.suite}/${c.severity}] ${c.name} — ${c.detail} (${c.ms}ms)`),
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
          subtitle="End-to-end application checks on the iProjectX platform organisation only. Customer tenants are never queried."
        />
        <div className="flex gap-2">
          {report && (
            <Button variant="outline" size="sm" onClick={() => void copyReport()}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy results
            </Button>
          )}
          <Button size="sm" onClick={() => void run()} disabled={running || !selected.length}>
            {running ? (
              <FlaskConical className="mr-1.5 h-4 w-4 animate-pulse" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {running ? "Running…" : "Run selected"}
          </Button>
        </div>
      </div>

      <SectionFrame exportable={false}>
        <SectionTitle>Suites</SectionTitle>
        <div className="mb-3 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelected([...ALL_PLATFORM_SUITE_KINDS])}>
            All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setSelected(["e2e"])}>
            End to end only
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {PLATFORM_SUITE_KINDS.map((suite) => (
            <label key={suite.id} className="flex cursor-pointer gap-3 rounded-md border p-3">
              <Checkbox
                checked={selected.includes(suite.id)}
                onCheckedChange={() => toggle(suite.id)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{suite.label}</span>
                <span className="block text-sm text-muted-foreground">{suite.blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Live data is filtered to slug <code>iprojectx</code>. Performance is three sequential
          samples. Load is eight parallel GETs per public URL plus four parallel iProjectX project
          reads — a bounded tick, not a soak. Suites do not write. Reset below is a separate, confirmed
          wipe of iProjectX operational rows only.
        </p>
      </SectionFrame>

      <SectionFrame exportable={false}>
        <SectionTitle>Reset platform sample data</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Rebuilds the iProjectX lab so every commercial page has a story. Wipes existing operational
          sample rows for slug <code>iprojectx</code> only, then seeds the pack you pick. Customer
          tenants are never queried. Keeps {SAMPLE_KEEP_SURFACES.join("; ")}.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {PLATFORM_SAMPLE_PACKS.map((n) => (
            <label key={n} className="flex cursor-pointer gap-3 rounded-md border p-3">
              <input
                type="radio"
                name="sample-pack"
                className="mt-1"
                checked={pack === n}
                onChange={() => setPack(n)}
              />
              <span>
                <span className="block font-medium">{n} projects</span>
                <span className="block text-sm text-muted-foreground">{PLATFORM_SAMPLE_PACK_BLURBS[n]}</span>
              </span>
            </label>
          ))}
        </div>
        {preview && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{preview.org.name} now:</span>
            {Object.entries(preview.counts).map(([table, n]) => (
              <span key={table} className="rounded bg-slate-100 px-2 py-0.5">
                {table} {n}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[16rem] flex-1">
            <span className="mb-1 block text-sm font-medium">Type {PLATFORM_SAMPLE_CONFIRM} to confirm</span>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={PLATFORM_SAMPLE_CONFIRM}
              autoComplete="off"
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={resetting || confirm.trim().toLowerCase() !== PLATFORM_SAMPLE_CONFIRM}
            onClick={() => void resetLab()}
          >
            <Database className="mr-1.5 h-4 w-4" />
            {resetting ? "Resetting…" : `Wipe and seed ${pack}`}
          </Button>
        </div>
        {resetReport && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-emerald-900">
              Seeded pack {resetReport.pack} on {resetReport.org.name}.{" "}
              {resetReport.created.projects ?? 0} projects, {resetReport.created.risks ?? 0} risks,{" "}
              {resetReport.created.demand_pipeline ?? 0} demand ideas.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setSelected(["e2e"])}
            >
              Select End to end next
            </Button>
          </div>
        )}
      </SectionFrame>

      <div className="rounded-lg border bg-slate-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Result window</h2>
          {report && (
            <span className="text-sm text-muted-foreground">
              {report.platformOrg.name} · {new Date(report.ranAt).toLocaleString()}
            </span>
          )}
        </div>

        {!report && (
          <p className="text-sm text-muted-foreground">
            Select suites and click <strong>Run selected</strong>. Failures appear here grouped by
            criticality so you can act on Critical first.
          </p>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{report.passed} passed</Badge>
              <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">{report.failed} failed</Badge>
              {SEVERITY_ORDER.map((sev) => (
                <span key={sev} className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[sev]}`}>
                  {report.issueCounts[sev]} {sev}
                </span>
              ))}
            </div>

            {SEVERITY_ORDER.map((sev) => {
              const rows = report.issues.filter((i) => i.severity === sev);
              if (!rows.length) return null;
              return (
                <div key={sev}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium uppercase ${SEVERITY_CLASS[sev]}`}>
                      {sev}
                    </span>
                    <span className="text-sm text-muted-foreground">{rows.length} issue{rows.length === 1 ? "" : "s"} to act on</span>
                  </div>
                  <div className="overflow-x-auto rounded border bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Suite</th>
                          <th className="px-3 py-2 font-medium">Issue</th>
                          <th className="px-3 py-2 font-medium">What to act on</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((issue) => (
                          <tr key={issue.id} className="border-b border-slate-100 align-top">
                            <td className="px-3 py-2 capitalize">{issue.suite}</td>
                            <td className="px-3 py-2 font-medium">{issue.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{issue.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {!report.issues.length && (
              <p className="text-sm text-emerald-800">No issues. All selected suites passed.</p>
            )}
          </div>
        )}
      </div>

      {suiteGroups.map((group) => (
        <SectionFrame key={group.name} exportable={false}>
          <SectionTitle>{group.name} log</SectionTitle>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
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
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_CLASS[c.severity]}`}>
                        {c.severity}
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
    </div>
  );
}
