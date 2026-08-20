import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { useAuth, canEditProjects } from "@/lib/auth-context";
import { PageHeading, SectionFrame } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportOrganizationWorkbook, importOrganizationWorkbook, type ImportReport } from "@/lib/excel";
import { toast } from "sonner";
import { Upload, Download, Plus, Loader2 } from "lucide-react";
import { TABLES } from "@/lib/data-tables";
import { TableEditor } from "@/components/table-editor";
import { useCapabilityPermission } from "@/lib/permissions";
import {
  enqueueOrgExportJob,
  getOrgExportJob,
  processOrgExportJobChunk,
} from "@/lib/export-jobs.functions";

export const Route = createFileRoute("/_authenticated/app/data-editor")({ component: Page });

function Page() {
  const { organization, roles } = useAuth();
  const canEdit = canEditProjects(roles);
  const uploadCap = useCapabilityPermission("template_upload");
  const editorCap = useCapabilityPermission("data_editor");
  const canUpload = uploadCap.canEdit || uploadCap.canOther;
  const canDataEdit = editorCap.canEdit || editorCap.canOther;
  const [busy, setBusy] = useState<"export" | "import" | "async" | null>(null);
  const [report, setReport] = useState<ImportReport[] | null>(null);
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const enqueueExport = useServerFn(enqueueOrgExportJob);
  const getExportJob = useServerFn(getOrgExportJob);
  const processExportChunk = useServerFn(processOrgExportJobChunk);

  const asyncJobQ = useQuery({
    queryKey: ["export_jobs", organization?.id, asyncJobId],
    queryFn: () =>
      getExportJob({ data: { orgId: organization!.id, jobId: asyncJobId! } }),
    enabled: Boolean(organization?.id && asyncJobId),
    refetchInterval: (q) => {
      const st = (q.state.data as { status?: string } | undefined)?.status;
      return st === "queued" || st === "running" ? 1500 : false;
    },
  });

  const handleExport = async () => {
    if (!organization) return;
    setBusy("export");
    try {
      await exportOrganizationWorkbook(organization.id, organization.name);
      toast.success("Downloaded organization workbook");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally { setBusy(null); }
  };

  const handleAsyncExport = async () => {
    if (!organization) return;
    setBusy("async");
    try {
      const job = await enqueueExport({
        data: { orgId: organization.id, kind: "org_workbook" },
      });
      setAsyncJobId(job.id);
      toast.success("Queued async export — draining chunks…");
      let done = false;
      let guard = 0;
      while (!done && guard < 200) {
        guard += 1;
        const chunk = await processExportChunk({
          data: { orgId: organization.id, jobId: job.id, chunkSize: 500 },
        });
        done = Boolean(chunk.done);
        if (!done) await new Promise((r) => setTimeout(r, 50));
      }
      toast.success(done ? "Async export finished scanning tables" : "Async export still running");
    } catch (e: any) {
      toast.error(e.message ?? "Async export failed");
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    if (!organization) return;
    setBusy("import");
    setReport(null);
    try {
      const results = await importOrganizationWorkbook(organization.id, file);
      setReport(results);
      const totals = results.reduce((a, r) => ({ i: a.i + r.inserted, u: a.u + r.updated, e: a.e + r.errors.length }), { i: 0, u: 0, e: 0 });
      toast.success(`Import complete — ${totals.i} added, ${totals.u} updated, ${totals.e} errors`);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <PageHeading
        icon="✏️"
        title="Data Editor"
        subtitle={
          canDataEdit
            ? "Edit every table here. Download the workbook, edit offline, and re-upload when permitted."
            : "Browse organisation tables. Ask an admin for Data Editor changes permission to edit."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy === "export"} onClick={handleExport}>
              {busy === "export" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              Download data
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "async"}
              onClick={() => void handleAsyncExport()}
              title="Chunked export for large organisations (BYOD-aware)"
            >
              {busy === "async" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1 h-4 w-4" />
              )}
              Async export
            </Button>
            {canUpload && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
                />
                <Button variant="outline" size="sm" disabled={busy === "import"} onClick={() => fileRef.current?.click()}>
                  {busy === "import" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  {busy === "import" ? "Uploading…" : "Upload data"}
                </Button>
              </>
            )}
            {canEdit && (
              <Button size="sm" asChild>
                <Link to="/app/projects/new"><Plus className="mr-1 h-4 w-4" />New Project</Link>
              </Button>
            )}
          </div>
        }
      />

      {asyncJobId && asyncJobQ.data ? (
        <SectionFrame className="mb-4">
          <div className="text-sm font-semibold mb-1">Async export job</div>
          <p className="text-xs text-muted-foreground">
            Status: <span className="font-medium text-foreground">{asyncJobQ.data.status}</span>
            {" · "}
            Progress: {asyncJobQ.data.progress_pct}%
            {" · "}
            Rows scanned: {Number(asyncJobQ.data.row_count || 0).toLocaleString()}
            {asyncJobQ.data.error_message
              ? ` · Error: ${asyncJobQ.data.error_message}`
              : ""}
          </p>
        </SectionFrame>
      ) : null}

      {report && (
        <SectionFrame className="mb-4">
          <div className="text-sm font-semibold mb-2">Import Report</div>
          <div className="overflow-auto">
            <table className="st-table text-xs">
              <thead><tr><th>Sheet</th><th>Added</th><th>Updated</th><th>Skipped</th><th>Errors</th></tr></thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.table}>
                    <td>{r.table}</td>
                    <td>{r.inserted}</td>
                    <td>{r.updated}</td>
                    <td>{r.skipped}</td>
                    <td className={r.errors.length ? "text-destructive" : ""}>
                      {r.errors.length === 0 ? "—" : (
                        <details><summary>{r.errors.length}</summary>
                          <ul className="ml-4 list-disc">{r.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionFrame>
      )}

      <Tabs defaultValue={TABLES[0].key} className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {TABLES.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABLES.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <SectionFrame>
              <TableEditor def={t} />
            </SectionFrame>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
