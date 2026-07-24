import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Layers, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  createProjectStream,
  deleteProjectStream,
  duplicateProjectStream,
  ensureProjectCoreStream,
  fetchProjectStreams,
  updateProjectStream,
  type ProjectStream,
} from "@/lib/project-streams";

const RAG_OPTS = ["Green", "Amber", "Red"] as const;
const STATUS_OPTS = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"] as const;

function money(n: number) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

function emptyDraft(orgId: string, projectId: string, sortOrder: number): Partial<ProjectStream> & {
  org_id: string;
  project_id: string;
  name: string;
} {
  return {
    org_id: orgId,
    project_id: projectId,
    name: "",
    code: "",
    owner: "",
    status: "In Progress",
    rag: "Green",
    is_default: false,
    sort_order: sortOrder,
    planned_start_date: null,
    planned_end_date: null,
    actual_start_date: null,
    actual_end_date: null,
    budget: 0,
    capex_approved: 0,
    capex_incurred: 0,
    opex_approved: 0,
    opex_incurred: 0,
    forecast_at_completion: null,
    description: "",
  };
}

function StreamEditor({
  stream,
  onSave,
  onDelete,
  onDuplicate,
  busy,
  canDelete,
}: {
  stream: ProjectStream | (Partial<ProjectStream> & { org_id: string; project_id: string; name: string });
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDuplicate?: () => Promise<void>;
  busy?: boolean;
  canDelete?: boolean;
}) {
  const [draft, setDraft] = useState(() => ({ ...stream }));
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  const Field = ({
    label,
    children,
  }: {
    label: string;
    children: ReactNode;
  }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );

  const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          {draft.name || "New stream"}
          {draft.is_default ? (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Default / Core
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onDuplicate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              title="Duplicate as a new stream template (planned dates, gates, finance plan). Clears actuals; skips resource allocations."
              onClick={() => void onDuplicate()}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Duplicate
            </Button>
          ) : null}
          {canDelete && onDelete ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onDelete()}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || !String(draft.name || "").trim()}
            onClick={() =>
              void onSave({
                name: String(draft.name || "").trim(),
                code: draft.code || null,
                owner: draft.owner || null,
                status: draft.status || "Active",
                rag: draft.rag || null,
                description: draft.description || null,
                planned_start_date: draft.planned_start_date || null,
                planned_end_date: draft.planned_end_date || null,
                actual_start_date: draft.actual_start_date || null,
                actual_end_date: draft.actual_end_date || null,
                budget: Number(draft.budget || 0),
                capex_approved: Number(draft.capex_approved || 0),
                capex_incurred: Number(draft.capex_incurred || 0),
                opex_approved: Number(draft.opex_approved || 0),
                opex_incurred: Number(draft.opex_incurred || 0),
                forecast_at_completion:
                  draft.forecast_at_completion == null || draft.forecast_at_completion === ("" as any)
                    ? null
                    : Number(draft.forecast_at_completion),
                sort_order: Number(draft.sort_order || 0),
              })
            }
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name">
          <Input className={inputCls} value={draft.name || ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Code">
          <Input className={inputCls} value={draft.code || ""} onChange={(e) => set("code", e.target.value)} />
        </Field>
        <Field label="Owner">
          <Input className={inputCls} value={draft.owner || ""} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label="Status">
          <select
            className={inputCls}
            value={draft.status || "Active"}
            onChange={(e) => set("status", e.target.value)}
          >
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="RAG">
          <select className={inputCls} value={draft.rag || "Green"} onChange={(e) => set("rag", e.target.value)}>
            {RAG_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort">
          <Input
            type="number"
            className={inputCls}
            value={draft.sort_order ?? 0}
            onChange={(e) => set("sort_order", Number(e.target.value || 0))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Planned start">
          <Input
            type="date"
            className={inputCls}
            value={draft.planned_start_date || ""}
            onChange={(e) => set("planned_start_date", e.target.value || null)}
          />
        </Field>
        <Field label="Planned end">
          <Input
            type="date"
            className={inputCls}
            value={draft.planned_end_date || ""}
            onChange={(e) => set("planned_end_date", e.target.value || null)}
          />
        </Field>
        <Field label="Actual start">
          <Input
            type="date"
            className={inputCls}
            value={draft.actual_start_date || ""}
            onChange={(e) => set("actual_start_date", e.target.value || null)}
          />
        </Field>
        <Field label="Actual end">
          <Input
            type="date"
            className={inputCls}
            value={draft.actual_end_date || ""}
            onChange={(e) => set("actual_end_date", e.target.value || null)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Budget">
          <Input
            type="number"
            className={inputCls}
            value={draft.budget ?? 0}
            onChange={(e) => set("budget", e.target.value)}
          />
        </Field>
        <Field label="CAPEX approved">
          <Input
            type="number"
            className={inputCls}
            value={draft.capex_approved ?? 0}
            onChange={(e) => set("capex_approved", e.target.value)}
          />
        </Field>
        <Field label="CAPEX incurred">
          <Input
            type="number"
            className={inputCls}
            value={draft.capex_incurred ?? 0}
            onChange={(e) => set("capex_incurred", e.target.value)}
          />
        </Field>
        <Field label="OPEX approved">
          <Input
            type="number"
            className={inputCls}
            value={draft.opex_approved ?? 0}
            onChange={(e) => set("opex_approved", e.target.value)}
          />
        </Field>
        <Field label="OPEX incurred">
          <Input
            type="number"
            className={inputCls}
            value={draft.opex_incurred ?? 0}
            onChange={(e) => set("opex_incurred", e.target.value)}
          />
        </Field>
        <Field label="FAC">
          <Input
            type="number"
            className={inputCls}
            value={draft.forecast_at_completion ?? ""}
            onChange={(e) => set("forecast_at_completion", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          className={`${inputCls} min-h-[64px]`}
          value={draft.description || ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function ProjectStreamsPanel({
  projectId,
  orgId,
  streamsEnabled: _streamsEnabled = true,
  projectRollup,
}: {
  projectId: string;
  orgId: string;
  /** @deprecated Always-on Core — kept for call-site compat. */
  streamsEnabled?: boolean;
  projectRollup?: {
    budget?: number | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
  };
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const { data: streams = [], isLoading } = useQuery({
    queryKey: ["project_streams", projectId],
    queryFn: () => fetchProjectStreams(projectId),
    enabled: !!projectId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project_streams", projectId] });
    qc.invalidateQueries({ queryKey: ["project_streams"] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["stage_gates"] });
    qc.invalidateQueries({ queryKey: ["milestones"] });
    qc.invalidateQueries({ queryKey: ["fy_allocations"] });
    qc.invalidateQueries({ queryKey: ["financials_monthly"] });
  };

  // Always-on Core: if migration hasn't landed yet, ensure on first visit.
  useEffect(() => {
    if (!projectId || isLoading || streams.length > 0) return;
    let cancelled = false;
    void ensureProjectCoreStream(projectId)
      .then(() => {
        if (!cancelled) invalidate();
      })
      .catch((e: Error) => {
        if (!cancelled) toast.error(e.message || "Could not create Core stream");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isLoading, streams.length]);

  const totals = useMemo(() => {
    const budget = streams.reduce((s, x) => s + Number(x.budget || 0), 0);
    const incurred = streams.reduce(
      (s, x) => s + Number(x.capex_incurred || 0) + Number(x.opex_incurred || 0),
      0,
    );
    const approved = streams.reduce(
      (s, x) => s + Number(x.capex_approved || 0) + Number(x.opex_approved || 0),
      0,
    );
    return { budget, incurred, approved, count: streams.length };
  }, [streams]);

  return (
    <div className="space-y-4">
      <SectionFrame>
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Layers className="h-4 w-4" /> Streams rollup
          </span>
        </SectionTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          Every project has at least a <span className="font-medium text-foreground">Core</span> stream.
          Streams own planned vs actual dates, gates, milestones, budget, and allocations — the project is the
          rollup (min/max dates, sum of finance). Timelines show stream lanes by default; turn on{" "}
          <span className="font-medium text-foreground">Project timeline</span> to also see the project
          start→end rollup. Use <span className="font-medium text-foreground">Duplicate</span> to clone a
          stream’s planned schedule, gates, and finance plan (actuals cleared; resources not copied).
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Streams" value={totals.count} />
          <KpiCard label="Budget (sum)" value={money(totals.budget)} />
          <KpiCard label="Approved (sum)" value={money(totals.approved)} />
          <KpiCard label="Incurred (sum)" value={money(totals.incurred)} />
        </div>
        {projectRollup ? (
          <div className="mt-3 text-[11px] text-muted-foreground">
            Project rollup window:{" "}
            <span className="text-foreground">
              {projectRollup.planned_start_date || projectRollup.actual_start_date || "—"} →{" "}
              {projectRollup.actual_end_date || projectRollup.planned_end_date || "—"}
            </span>
          </div>
        ) : null}
      </SectionFrame>

      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Stream register</SectionTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={adding}
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add stream
          </Button>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading streams…</div>
        ) : (
          <div className="space-y-3">
            {streams.map((s) => (
              <StreamEditor
                key={s.id}
                stream={s}
                busy={duplicatingId === s.id}
                canDelete={!s.is_default && streams.length > 1}
                onDuplicate={async () => {
                  setDuplicatingId(s.id);
                  try {
                    const result = await duplicateProjectStream(s.id, { existingStreams: streams });
                    const bits = [
                      result.gatesCopied ? `${result.gatesCopied} gates` : null,
                      result.milestonesCopied ? `${result.milestonesCopied} milestones` : null,
                      result.fyCopied ? `${result.fyCopied} FY rows` : null,
                      result.monthlyCopied ? `${result.monthlyCopied} monthly rows` : null,
                    ].filter(Boolean);
                    toast.success(
                      bits.length
                        ? `Duplicated as “${result.stream.name}” (${bits.join(", ")})`
                        : `Duplicated as “${result.stream.name}”`,
                    );
                    invalidate();
                  } catch (e: any) {
                    toast.error(e.message || "Duplicate failed");
                  } finally {
                    setDuplicatingId(null);
                  }
                }}
                onDelete={async () => {
                  if (!confirm(`Delete stream “${s.name}”? Child gates/finance on this stream will be removed.`)) {
                    return;
                  }
                  try {
                    await deleteProjectStream(s.id);
                    toast.success("Stream deleted");
                    invalidate();
                  } catch (e: any) {
                    toast.error(e.message || "Delete failed");
                  }
                }}
                onSave={async (patch) => {
                  try {
                    await updateProjectStream(s.id, patch as any);
                    toast.success("Stream saved");
                    invalidate();
                  } catch (e: any) {
                    toast.error(e.message || "Save failed");
                  }
                }}
              />
            ))}

            {adding ? (
              <StreamEditor
                stream={emptyDraft(orgId, projectId, streams.length)}
                onSave={async (patch) => {
                  try {
                    await createProjectStream({
                      org_id: orgId,
                      project_id: projectId,
                      name: String(patch.name),
                      code: (patch.code as string) || null,
                      owner: (patch.owner as string) || null,
                      status: (patch.status as string) || "Active",
                      rag: (patch.rag as string) || null,
                      description: (patch.description as string) || null,
                      is_default: false,
                      sort_order: Number(patch.sort_order || streams.length),
                      planned_start_date: (patch.planned_start_date as string) || null,
                      planned_end_date: (patch.planned_end_date as string) || null,
                      actual_start_date: (patch.actual_start_date as string) || null,
                      actual_end_date: (patch.actual_end_date as string) || null,
                      budget: Number(patch.budget || 0),
                      capex_approved: Number(patch.capex_approved || 0),
                      capex_incurred: Number(patch.capex_incurred || 0),
                      opex_approved: Number(patch.opex_approved || 0),
                      opex_incurred: Number(patch.opex_incurred || 0),
                      forecast_at_completion:
                        patch.forecast_at_completion == null ? null : Number(patch.forecast_at_completion),
                    });
                    toast.success("Stream created");
                    setAdding(false);
                    invalidate();
                  } catch (e: any) {
                    toast.error(e.message || "Create failed");
                  }
                }}
              />
            ) : null}

            {streams.length === 0 && !adding ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No streams yet.</div>
            ) : null}
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
