import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, X, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageLoading } from "@/components/page-loading";
import { memberLabel, type OrgMember } from "@/lib/decision-approval";
import {
  addDays,
  APPROVAL_DECISION_LABEL,
  canReopenTimesheet,
  DAY_KEYS,
  DAY_LABELS,
  entryWeekTotal,
  formatWeekRange,
  normalizeTimesheetStatus,
  TIMESHEET_STATUS_CLASS,
  TIMESHEET_STATUS_LABEL,
  weekStartMonday,
  type DayKey,
  type TimesheetStatus,
} from "@/lib/timesheet";
import { downloadCsv } from "@/lib/timesheet-reports";

type ApprovalRow = {
  id: string;
  timesheet_id: string;
  step: "pm" | "rm";
  project_id: string | null;
  approver_user_id: string;
  status: string;
  comment: string | null;
  acted_at: string | null;
  created_at?: string | null;
};

type TimesheetRow = {
  id: string;
  user_id: string;
  resource_id: string | null;
  week_start: string;
  status: string;
  reopen_reason?: string | null;
};

type EntryRow = {
  id: string;
  timesheet_id: string;
  project_id: string | null;
  work_item_id: string | null;
  billable: boolean;
  custom_task: string | null;
  hours_mon: number;
  hours_tue: number;
  hours_wed: number;
  hours_thu: number;
  hours_fri: number;
  hours_sat: number;
  hours_sun: number;
  notes: string | null;
  labor_cost?: number | null;
};

type ResourceRow = { id: string; name: string; user_id: string | null };

type Props = {
  orgId: string;
  userId: string;
  members: OrgMember[];
  projects: Array<{ id: string; name?: string | null; project_code?: string | null }>;
  resources: ResourceRow[];
  workItems: Array<{ id: string; title: string | null; wbs_code: string | null }>;
};

type InboxMode = "pending" | "history";

export function TimesheetApprovalsPanel({
  orgId,
  userId,
  members,
  projects,
  resources,
  workItems,
}: Props) {
  const qc = useQueryClient();
  const thisWeek = weekStartMonday();
  const [mode, setMode] = useState<InboxMode>("pending");
  const [fromWeek, setFromWeek] = useState(() => addDays(thisWeek, -56));
  const [toWeek, setToWeek] = useState(thisWeek);
  const [resourceFilter, setResourceFilter] = useState("all");
  const [stepFilter, setStepFilter] = useState<"all" | "pm" | "rm">("all");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "approved" | "rejected">("all");
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const resourceById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const resourceByUser = useMemo(() => {
    const m = new Map<string, ResourceRow>();
    for (const r of resources) if (r.user_id) m.set(r.user_id, r);
    return m;
  }, [resources]);
  const workById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems]);

  const { data: myApprovals = [], isLoading: approvalsLoading } = useQuery({
    queryKey: ["timesheet_approvals", orgId, userId, mode, fromWeek, toWeek],
    queryFn: async () => {
      let q = (supabase as any)
        .from("timesheet_approvals")
        .select(
          "id,timesheet_id,step,project_id,approver_user_id,status,comment,acted_at,created_at",
        )
        .eq("approver_user_id", userId)
        .order(mode === "pending" ? "created_at" : "acted_at", { ascending: false });

      if (mode === "pending") {
        q = q.eq("status", "pending");
      } else {
        q = q.in("status", ["approved", "rejected"]);
      }

      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data ?? []) as ApprovalRow[];
    },
    enabled: !!orgId && !!userId,
  });

  const sheetIds = useMemo(
    () => [...new Set(myApprovals.map((a) => a.timesheet_id))],
    [myApprovals],
  );

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery({
    queryKey: ["timesheets", orgId, "approver-inbox", sheetIds.join(",")],
    queryFn: async () => {
      if (!sheetIds.length) return [] as TimesheetRow[];
      const { data, error } = await (supabase as any)
        .from("timesheets")
        .select("id,user_id,resource_id,week_start,status,reopen_reason")
        .in("id", sheetIds);
      if (error) throw error;
      return (data ?? []) as TimesheetRow[];
    },
    enabled: sheetIds.length > 0,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["timesheet_entries", orgId, "approver-inbox", sheetIds.join(",")],
    queryFn: async () => {
      if (!sheetIds.length) return [] as EntryRow[];
      const { data, error } = await (supabase as any)
        .from("timesheet_entries")
        .select(
          "id,timesheet_id,project_id,work_item_id,billable,custom_task,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun,notes,labor_cost",
        )
        .in("timesheet_id", sheetIds);
      if (error) throw error;
      return (data ?? []) as EntryRow[];
    },
    enabled: sheetIds.length > 0,
  });

  const sheetById = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets]);
  const entriesBySheet = useMemo(() => {
    const m = new Map<string, EntryRow[]>();
    for (const e of entries) {
      const list = m.get(e.timesheet_id) || [];
      list.push(e);
      m.set(e.timesheet_id, list);
    }
    return m;
  }, [entries]);

  const resourceLabel = (s: TimesheetRow | undefined) => {
    if (!s) return "—";
    const byRes = s.resource_id ? resourceById.get(s.resource_id) : null;
    if (byRes?.name) return byRes.name;
    const byUser = resourceByUser.get(s.user_id);
    if (byUser?.name) return byUser.name;
    const m = memberById.get(s.user_id);
    return m ? memberLabel(m) : s.user_id.slice(0, 8);
  };

  const filteredApprovals = useMemo(() => {
    const from = fromWeek <= toWeek ? fromWeek : toWeek;
    const to = fromWeek <= toWeek ? toWeek : fromWeek;
    return myApprovals.filter((a) => {
      const s = sheetById.get(a.timesheet_id);
      if (!s) return mode === "pending"; // keep pending even if sheet lagging
      if (s.week_start < from || s.week_start > to) return false;
      if (stepFilter !== "all" && a.step !== stepFilter) return false;
      if (mode === "history" && decisionFilter !== "all" && a.status !== decisionFilter) {
        return false;
      }
      if (resourceFilter !== "all") {
        const res = s.resource_id
          ? resourceById.get(s.resource_id)
          : resourceByUser.get(s.user_id);
        const matchId = res?.id || s.resource_id;
        const matchUser = res?.user_id || s.user_id;
        if (resourceFilter !== matchId && resourceFilter !== matchUser) return false;
      }
      if (mode === "pending") {
        const st = normalizeTimesheetStatus(s.status);
        if (a.step === "pm" && st !== "pending_pm") return false;
        if (a.step === "rm" && st !== "pending_rm") return false;
      }
      return true;
    });
  }, [
    myApprovals,
    sheetById,
    fromWeek,
    toWeek,
    stepFilter,
    decisionFilter,
    resourceFilter,
    resourceById,
    resourceByUser,
    mode,
  ]);

  const linesForApproval = (a: ApprovalRow, s: TimesheetRow) => {
    const all = entriesBySheet.get(s.id) || [];
    if (a.step === "pm" && a.project_id) {
      return all.filter((e) => e.project_id === a.project_id || e.billable === false);
    }
    return all;
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["timesheet_approvals"] });
    void qc.invalidateQueries({ queryKey: ["timesheets"] });
    void qc.invalidateQueries({ queryKey: ["timesheet_entries"] });
    void qc.invalidateQueries({ queryKey: ["work_items"] });
    void qc.invalidateQueries({ queryKey: ["financials_monthly"] });
    window.dispatchEvent(new CustomEvent("pmo:data-changed"));
  };

  const act = useMutation({
    mutationFn: async (payload: {
      approvalId: string;
      decision: "approved" | "rejected";
      comment?: string;
    }) => {
      const { error } = await supabase.rpc("act_on_timesheet_approval" as any, {
        _approval_id: payload.approvalId,
        _decision: payload.decision,
        _comment: payload.comment ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      setSelectedPending((prev) => {
        const next = new Set(prev);
        next.delete(v.approvalId);
        return next;
      });
      invalidate();
      toast.success(v.decision === "approved" ? "Approved" : "Rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.rpc("act_on_timesheet_approval" as any, {
          _approval_id: id,
          _decision: "approved",
          _comment: null,
        } as never);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      setSelectedPending(new Set());
      invalidate();
      toast.success(`Approved ${n} timesheet${n === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async ({ timesheetId, reason }: { timesheetId: string; reason: string }) => {
      const { error } = await supabase.rpc("reopen_timesheet" as any, {
        _timesheet_id: timesheetId,
        _reason: reason || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Timesheet reopened to draft — owner can edit and resubmit");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingVisible = mode === "pending" ? filteredApprovals : [];
  const historyVisible = mode === "history" ? filteredApprovals : [];

  const totPendingHours = pendingVisible.reduce((sum, a) => {
    const s = sheetById.get(a.timesheet_id);
    if (!s) return sum;
    return sum + linesForApproval(a, s).reduce((h, e) => h + entryWeekTotal(e), 0);
  }, 0);

  const resourcesForFilter = useMemo(() => {
    const ids = new Set<string>();
    for (const a of myApprovals) {
      const s = sheetById.get(a.timesheet_id);
      if (!s) continue;
      const r = s.resource_id ? resourceById.get(s.resource_id) : resourceByUser.get(s.user_id);
      if (r) ids.add(r.id);
      else if (s.user_id) ids.add(s.user_id);
    }
    return [...ids]
      .map((id) => {
        const r = resourceById.get(id);
        if (r) return { id: r.id, label: r.name };
        const m = memberById.get(id);
        return { id, label: m ? memberLabel(m) : id.slice(0, 8) };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [myApprovals, sheetById, resourceById, resourceByUser, memberById]);

  const exportHistory = () => {
    const rows = historyVisible.map((a) => {
      const s = sheetById.get(a.timesheet_id);
      const lines = s ? linesForApproval(a, s) : [];
      const hours = lines.reduce((h, e) => h + entryWeekTotal(e), 0);
      return {
        week_start: s?.week_start || "",
        week_range: s ? formatWeekRange(s.week_start) : "",
        resource: resourceLabel(s),
        person: s
          ? memberLabel(memberById.get(s.user_id) || { id: s.user_id, full_name: null, email: null })
          : "",
        step: a.step === "pm" ? "Project Manager" : "Resource Manager",
        project:
          a.project_id != null
            ? projectById.get(a.project_id)?.project_code ||
              projectById.get(a.project_id)?.name ||
              a.project_id
            : "",
        decision: APPROVAL_DECISION_LABEL[a.status] || a.status,
        acted_at: a.acted_at || "",
        hours: Math.round(hours * 10) / 10,
        comment: a.comment || "",
        sheet_status: s ? TIMESHEET_STATUS_LABEL[normalizeTimesheetStatus(s.status)] : "",
      };
    });
    downloadCsv(
      `iProjectX_Timesheet_Approvals_${fromWeek}_${toWeek}.csv`,
      [
        "week_start",
        "week_range",
        "resource",
        "person",
        "step",
        "project",
        "decision",
        "acted_at",
        "hours",
        "comment",
        "sheet_status",
      ],
      rows,
    );
    toast.success("Approval history exported");
  };

  const loading = approvalsLoading || (sheetIds.length > 0 && sheetsLoading);
  const box =
    "h-8 rounded-md border border-border bg-surface px-2 text-[12px] shadow-sm outline-none focus:ring-2 focus:ring-primary/30";

  const taskLabel = (e: EntryRow) => {
    if (e.billable === false) return `Non-billable · ${e.custom_task || "Custom task"}`;
    const wi = e.work_item_id ? workById.get(e.work_item_id) : null;
    const p = e.project_id ? projectById.get(e.project_id) : null;
    const code = p?.project_code || p?.name || "—";
    const title = wi?.title || (wi?.wbs_code ? `WBS ${wi.wbs_code}` : "Work item");
    return `${code} · ${title}`;
  };

  const renderCard = (a: ApprovalRow, opts: { history: boolean }) => {
    const s = sheetById.get(a.timesheet_id);
    if (!s && opts.history) return null;
    const lines = s ? linesForApproval(a, s) : [];
    const total = lines.reduce((sum, e) => sum + entryWeekTotal(e), 0);
    const st = s ? normalizeTimesheetStatus(s.status) : ("draft" as TimesheetStatus);
    const open = expandedId === a.id;
    const checked = selectedPending.has(a.id);

    return (
      <div key={a.id} className="rounded-lg border border-border bg-surface/60 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {!opts.history && (
              <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelectedPending((prev) => {
                      const next = new Set(prev);
                      if (next.has(a.id)) next.delete(a.id);
                      else next.add(a.id);
                      return next;
                    });
                  }}
                />
                Select for bulk approve
              </label>
            )}
            <div className="text-sm font-semibold">
              {resourceLabel(s)} · {s ? formatWeekRange(s.week_start) : "—"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {a.step === "pm"
                  ? `PM${
                      a.project_id
                        ? ` · ${projectById.get(a.project_id)?.project_code || ""}`
                        : ""
                    }`
                  : "Resource Manager"}
              </span>
              <span>· {total.toFixed(1)}h</span>
              {s && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIMESHEET_STATUS_CLASS[st]}`}
                >
                  {TIMESHEET_STATUS_LABEL[st]}
                </span>
              )}
              {opts.history && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                  {APPROVAL_DECISION_LABEL[a.status] || a.status}
                  {a.acted_at ? ` · ${new Date(a.acted_at).toLocaleString()}` : ""}
                </span>
              )}
            </div>
            {a.comment && (
              <p className="mt-1 text-xs text-muted-foreground">Comment: {a.comment}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
              onClick={() => setExpandedId(open ? null : a.id)}
            >
              {open ? "Hide hours" : "Show hours"}
            </button>
            {!opts.history && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  disabled={act.isPending}
                  onClick={() => {
                    const comment =
                      window.prompt("Approval comment (optional)") || undefined;
                    act.mutate({ approvalId: a.id, decision: "approved", comment });
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                  disabled={act.isPending}
                  onClick={() => {
                    const comment = window.prompt("Rejection reason (optional)") || undefined;
                    act.mutate({ approvalId: a.id, decision: "rejected", comment });
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </>
            )}
            {opts.history && s && canReopenTimesheet(s.status) && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                disabled={reopen.isPending}
                onClick={() => {
                  const reason = window.prompt(
                    "Reopen reason (shown to the resource). Timesheet returns to draft.",
                  );
                  if (reason === null) return;
                  reopen.mutate({ timesheetId: s.id, reason: reason.trim() });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </button>
            )}
          </div>
        </div>

        {open && (
          <div className="overflow-x-auto">
            <table className="st-table w-full table-fixed text-xs">
              <thead>
                <tr>
                  <th>Project / task</th>
                  {DAY_LABELS.map((d) => (
                    <th key={d} className="st-center">
                      {d}
                    </th>
                  ))}
                  <th className="st-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-muted-foreground">
                      No hour lines.
                    </td>
                  </tr>
                ) : (
                  lines.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div>{taskLabel(e)}</div>
                        {e.notes ? (
                          <div className="text-[10px] text-muted-foreground">{e.notes}</div>
                        ) : null}
                      </td>
                      {DAY_KEYS.map((dk: DayKey) => (
                        <td key={dk} className="st-center tabular-nums">
                          {Number(e[dk]) || "·"}
                        </td>
                      ))}
                      <td className="st-num font-medium">{entryWeekTotal(e).toFixed(1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionFrame>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Approvals</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                mode === "pending"
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-border bg-surface"
              }`}
              onClick={() => setMode("pending")}
            >
              Pending ({pendingVisible.length})
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                mode === "history"
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-border bg-surface"
              }`}
              onClick={() => setMode("history")}
            >
              History
            </button>
          </div>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          {mode === "pending"
            ? "Timesheets waiting for your Project Manager or Resource Manager decision. Filter by week and resource; approve in bulk when ready."
            : "Sheets you already approved or rejected. Filter by period and resource; reopen an approved sheet to draft if corrections are needed."}
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">From week</span>
            <input
              type="date"
              className={box}
              value={fromWeek}
              onChange={(e) => setFromWeek(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">To week</span>
            <input
              type="date"
              className={box}
              value={toWeek}
              onChange={(e) => setToWeek(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Resource</span>
            <select
              className={box + " min-w-[10rem]"}
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
            >
              <option value="all">All resources</option>
              {resourcesForFilter.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Step</span>
            <select
              className={box}
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value as "all" | "pm" | "rm")}
            >
              <option value="all">All steps</option>
              <option value="pm">Project Manager</option>
              <option value="rm">Resource Manager</option>
            </select>
          </label>
          {mode === "history" && (
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Decision</span>
              <select
                className={box}
                value={decisionFilter}
                onChange={(e) =>
                  setDecisionFilter(e.target.value as "all" | "approved" | "rejected")
                }
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="text-xs text-sky-700 hover:underline"
            onClick={() => {
              setFromWeek(addDays(thisWeek, mode === "pending" ? -14 : -56));
              setToWeek(thisWeek);
              setResourceFilter("all");
              setStepFilter("all");
              setDecisionFilter("all");
            }}
          >
            Reset filters
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label={mode === "pending" ? "Awaiting you" : "Decisions in view"}
            value={String(filteredApprovals.length)}
            accent="#0ea5e9"
          />
          <KpiCard
            label="Hours in view"
            value={
              mode === "pending"
                ? totPendingHours.toFixed(1)
                : historyVisible
                    .reduce((sum, a) => {
                      const s = sheetById.get(a.timesheet_id);
                      if (!s) return sum;
                      return sum + linesForApproval(a, s).reduce((h, e) => h + entryWeekTotal(e), 0);
                    }, 0)
                    .toFixed(1)
            }
            accent="#3b82f6"
          />
          <KpiCard
            label="Resources"
            value={String(resourcesForFilter.length)}
            accent="#8b5cf6"
          />
          <KpiCard
            label="Period"
            value={`${fromWeek.slice(5)} → ${toWeek.slice(5)}`}
            accent="#f59e0b"
          />
        </div>

        {mode === "pending" && pendingVisible.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" data-export-hide>
            <button
              type="button"
              className="st-btn-secondary text-xs"
              onClick={() => setSelectedPending(new Set(pendingVisible.map((a) => a.id)))}
            >
              Select all visible
            </button>
            <button
              type="button"
              className="st-btn-secondary text-xs"
              onClick={() => setSelectedPending(new Set())}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="st-btn-primary text-xs"
              disabled={selectedPending.size === 0 || bulkApprove.isPending}
              onClick={() => bulkApprove.mutate([...selectedPending])}
            >
              {bulkApprove.isPending
                ? "Approving…"
                : `Bulk approve (${selectedPending.size})`}
            </button>
          </div>
        )}

        {mode === "history" && (
          <div className="mb-3" data-export-hide>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              disabled={historyVisible.length === 0}
              onClick={exportHistory}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        )}
      </SectionFrame>

      {loading ? (
        <PageLoading label="Loading approvals…" fullScreen={false} />
      ) : filteredApprovals.length === 0 ? (
        <SectionFrame>
          <div className="py-8 text-center text-sm text-muted-foreground">
            {mode === "pending"
              ? "No timesheets waiting for you in this period."
              : "No approval history for the selected filters."}
          </div>
        </SectionFrame>
      ) : (
        <div className="space-y-3">
          {(mode === "pending" ? pendingVisible : historyVisible).map((a) =>
            renderCard(a, { history: mode === "history" }),
          )}
        </div>
      )}
    </div>
  );
}
