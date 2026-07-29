import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { PageLoading } from "@/components/page-loading";
import { memberLabel, type OrgMember } from "@/lib/decision-approval";
import {
  addDays,
  canEditTimesheet,
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

type TimesheetsSearch = { tab?: "mine" | "approvals" | "setup" };

export const Route = createFileRoute("/_authenticated/app/timesheets")({
  validateSearch: (s: Record<string, unknown>): TimesheetsSearch => ({
    tab:
      s.tab === "approvals" || s.tab === "setup" || s.tab === "mine"
        ? (s.tab as TimesheetsSearch["tab"])
        : undefined,
  }),
  component: TimesheetsPage,
});

type Timesheet = {
  id: string;
  org_id: string;
  user_id: string;
  resource_id: string | null;
  week_start: string;
  status: string;
  manager_user_id: string | null;
  notes: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
};

type Entry = {
  id: string;
  timesheet_id: string;
  project_id: string;
  work_item_id: string;
  hours_mon: number;
  hours_tue: number;
  hours_wed: number;
  hours_thu: number;
  hours_fri: number;
  hours_sat: number;
  hours_sun: number;
  notes: string | null;
};

type Approval = {
  id: string;
  timesheet_id: string;
  step: "pm" | "rm";
  project_id: string | null;
  approver_user_id: string;
  status: string;
  comment: string | null;
  acted_at: string | null;
};

type WorkItem = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  wbs_code: string | null;
  owner_user_id: string | null;
};

type ResourceRow = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  manager_user_id: string | null;
  status: string | null;
};

function emptyHours(): Record<DayKey, number> {
  return {
    hours_mon: 0,
    hours_tue: 0,
    hours_wed: 0,
    hours_thu: 0,
    hours_fri: 0,
    hours_sat: 0,
    hours_sun: 0,
  };
}

function TimesheetsPage() {
  const { organization, session, roles } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const isAdmin = roles.some((r) => r === "admin" || r === "org_admin");

  const [tab, setTab] = useState<"mine" | "approvals" | "setup">(search.tab || "mine");
  const [weekStart, setWeekStart] = useState(() => weekStartMonday());

  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  const setTabNav = (t: "mine" | "approvals" | "setup") => {
    setTab(t);
    navigate({ search: { tab: t === "mine" ? undefined : t } });
  };

  const { data: members = [] } = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("org_id", orgId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as OrgMember[];
    },
    enabled: !!orgId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });

  const { data: resources = [], isLoading: resourcesLoading } = useQuery({
    queryKey: ["resources", orgId, "timesheet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,email,user_id,manager_user_id,status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ResourceRow[];
    },
    enabled: !!orgId,
  });

  const myResource = useMemo(
    () => resources.find((r) => r.user_id === userId) || null,
    [resources, userId],
  );

  const { data: assignees = [] } = useQuery({
    queryKey: ["work_item_assignees", orgId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_item_assignees" as any)
        .select("work_item_id,user_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as unknown as { work_item_id: string; user_id: string }[];
    },
    enabled: !!orgId && !!userId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "timesheet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("id,project_id,title,status,wbs_code,owner_user_id")
        .neq("status", "Cancelled");
      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    enabled: !!orgId,
  });

  const assignedWorkItems = useMemo(() => {
    const ids = new Set(assignees.map((a) => a.work_item_id));
    // Also include owner_user_id matches (legacy / before assignee backfill)
    return workItems.filter(
      (w) =>
        ids.has(w.id) ||
        w.owner_user_id === userId,
    );
  }, [assignees, workItems, userId]);

  const { data: sheet, isLoading: sheetLoading } = useQuery({
    queryKey: ["timesheets", orgId, userId, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheets" as any)
        .select("*")
        .eq("user_id", userId!)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Timesheet | null) ?? null;
    },
    enabled: !!orgId && !!userId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["timesheet_entries", sheet?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_entries" as any)
        .select("*")
        .eq("timesheet_id", sheet!.id);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
    enabled: !!sheet?.id,
  });

  const { data: myApprovals = [] } = useQuery({
    queryKey: ["timesheet_approvals", orgId, userId, "mine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_approvals" as any)
        .select("*")
        .eq("approver_user_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Approval[];
    },
    enabled: !!orgId && !!userId,
  });

  const approvalSheetIds = useMemo(
    () => [...new Set(myApprovals.map((a) => a.timesheet_id))],
    [myApprovals],
  );

  const { data: approvalSheets = [] } = useQuery({
    queryKey: ["timesheets", orgId, "approvals", approvalSheetIds.join(",")],
    queryFn: async () => {
      if (approvalSheetIds.length === 0) return [] as Timesheet[];
      const { data, error } = await supabase
        .from("timesheets" as any)
        .select("*")
        .in("id", approvalSheetIds);
      if (error) throw error;
      return (data ?? []) as unknown as Timesheet[];
    },
    enabled: !!orgId && approvalSheetIds.length > 0,
  });

  const { data: approvalEntries = [] } = useQuery({
    queryKey: ["timesheet_entries", "approvals", approvalSheetIds.join(",")],
    queryFn: async () => {
      if (approvalSheetIds.length === 0) return [] as Entry[];
      const { data, error } = await supabase
        .from("timesheet_entries" as any)
        .select("*")
        .in("timesheet_id", approvalSheetIds);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
    enabled: approvalSheetIds.length > 0,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const workById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems]);
  const sheetById = useMemo(() => new Map(approvalSheets.map((s) => [s.id, s])), [approvalSheets]);

  const editable = canEditTimesheet(sheet?.status);

  /** Draft row state merged with placeholders for assigned work items. */
  const [draftRows, setDraftRows] = useState<
    Record<string, Record<DayKey, number> & { notes: string }>
  >({});

  useEffect(() => {
    const next: Record<string, Record<DayKey, number> & { notes: string }> = {};
    for (const wi of assignedWorkItems) {
      const existing = entries.find((e) => e.work_item_id === wi.id);
      next[wi.id] = {
        ...emptyHours(),
        ...(existing
          ? {
              hours_mon: Number(existing.hours_mon) || 0,
              hours_tue: Number(existing.hours_tue) || 0,
              hours_wed: Number(existing.hours_wed) || 0,
              hours_thu: Number(existing.hours_thu) || 0,
              hours_fri: Number(existing.hours_fri) || 0,
              hours_sat: Number(existing.hours_sat) || 0,
              hours_sun: Number(existing.hours_sun) || 0,
              notes: existing.notes || "",
            }
          : { notes: "" }),
      };
    }
    // Keep any saved entries that are no longer assigned (still show)
    for (const e of entries) {
      if (!next[e.work_item_id]) {
        next[e.work_item_id] = {
          hours_mon: Number(e.hours_mon) || 0,
          hours_tue: Number(e.hours_tue) || 0,
          hours_wed: Number(e.hours_wed) || 0,
          hours_thu: Number(e.hours_thu) || 0,
          hours_fri: Number(e.hours_fri) || 0,
          hours_sat: Number(e.hours_sat) || 0,
          hours_sun: Number(e.hours_sun) || 0,
          notes: e.notes || "",
        };
      }
    }
    setDraftRows(next);
  }, [assignedWorkItems, entries, weekStart, sheet?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["timesheets"] });
    qc.invalidateQueries({ queryKey: ["timesheet_entries"] });
    qc.invalidateQueries({ queryKey: ["timesheet_approvals"] });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    window.dispatchEvent(new CustomEvent("pmo:data-changed"));
  };

  const ensureSheet = async (): Promise<string> => {
    if (sheet?.id) return sheet.id;
    if (!orgId || !userId) throw new Error("Not signed in");
    const { data, error } = await supabase
      .from("timesheets" as any)
      .insert({
        org_id: orgId,
        user_id: userId,
        resource_id: myResource?.id || null,
        week_start: weekStart,
        status: "draft",
        manager_user_id: myResource?.manager_user_id || null,
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return (data as unknown as Timesheet).id;
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not signed in");
      if (!myResource) {
        throw new Error(
          "Link your login to a resource record (Setup tab / Resources) before saving timesheets.",
        );
      }
      const sheetId = await ensureSheet();
      const rows = Object.entries(draftRows).map(([workItemId, hours]) => {
        const wi = workById.get(workItemId) || assignedWorkItems.find((w) => w.id === workItemId);
        if (!wi) throw new Error("Unknown work item");
        return {
          org_id: orgId,
          timesheet_id: sheetId,
          project_id: wi.project_id,
          work_item_id: workItemId,
          hours_mon: hours.hours_mon || 0,
          hours_tue: hours.hours_tue || 0,
          hours_wed: hours.hours_wed || 0,
          hours_thu: hours.hours_thu || 0,
          hours_fri: hours.hours_fri || 0,
          hours_sat: hours.hours_sat || 0,
          hours_sun: hours.hours_sun || 0,
          notes: hours.notes || null,
        };
      });
      // Upsert by deleting and re-inserting draft rows for this sheet
      const { error: delErr } = await supabase
        .from("timesheet_entries" as any)
        .delete()
        .eq("timesheet_id", sheetId);
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await supabase.from("timesheet_entries" as any).insert(rows as never);
        if (error) throw error;
      }
      return sheetId;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Timesheet saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not signed in");
      if (!myResource) {
        throw new Error(
          "Link your login to a resource record before submitting timesheets.",
        );
      }
      if (!myResource.manager_user_id) {
        throw new Error("Resource Manager must be configured before submit.");
      }
      const sheetId = await ensureSheet();
      const rows = Object.entries(draftRows).map(([workItemId, hours]) => {
        const wi = workById.get(workItemId) || assignedWorkItems.find((w) => w.id === workItemId);
        if (!wi) throw new Error("Unknown work item");
        return {
          org_id: orgId,
          timesheet_id: sheetId,
          project_id: wi.project_id,
          work_item_id: workItemId,
          hours_mon: hours.hours_mon || 0,
          hours_tue: hours.hours_tue || 0,
          hours_wed: hours.hours_wed || 0,
          hours_thu: hours.hours_thu || 0,
          hours_fri: hours.hours_fri || 0,
          hours_sat: hours.hours_sat || 0,
          hours_sun: hours.hours_sun || 0,
          notes: hours.notes || null,
        };
      });
      if (!rows.length) throw new Error("Add hours on at least one assigned work item");
      const { error: delErr } = await supabase
        .from("timesheet_entries" as any)
        .delete()
        .eq("timesheet_id", sheetId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("timesheet_entries" as any)
        .insert(rows as never);
      if (insErr) throw insErr;
      const { data, error } = await supabase.rpc("submit_timesheet" as any, {
        _timesheet_id: sheetId,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Submitted — awaiting Project Manager, then Resource Manager");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = useMutation({
    mutationFn: async ({
      approvalId,
      decision,
      comment,
    }: {
      approvalId: string;
      decision: "approved" | "rejected";
      comment?: string;
    }) => {
      const { error } = await supabase.rpc("act_on_timesheet_approval" as any, {
        _approval_id: approvalId,
        _decision: decision,
        _comment: comment || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.decision === "approved" ? "Approved" : "Rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchResource = useMutation({
    mutationFn: async ({
      id,
      user_id,
      manager_user_id,
    }: {
      id: string;
      user_id: string | null;
      manager_user_id: string | null;
    }) => {
      const { error } = await supabase
        .from("resources")
        .update({ user_id, manager_user_id } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Resource updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weekTotal = useMemo(() => {
    return Object.values(draftRows).reduce((sum, r) => sum + entryWeekTotal(r), 0);
  }, [draftRows]);

  const status = normalizeTimesheetStatus(sheet?.status) as TimesheetStatus;

  const pendingForMe = myApprovals.filter((a) => {
    const s = sheetById.get(a.timesheet_id);
    if (!s) return false;
    if (a.step === "pm") return s.status === "pending_pm";
    if (a.step === "rm") return s.status === "pending_rm";
    return false;
  });

  return (
    <PageExport name="Timesheets" title="Timesheets">
      <PageHeading
        title="Timesheets"
        subtitle="Fill hours against assigned work items — approval runs Project Manager, then Resource Manager"
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mine", "My timesheet"],
                ["approvals", `Approvals${pendingForMe.length ? ` (${pendingForMe.length})` : ""}`],
                ...(isAdmin ? ([["setup", "Resource setup"]] as const) : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  tab === key
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-border bg-surface text-foreground"
                }`}
                onClick={() => setTabNav(key)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {tab === "mine" && (
        <>
          <SectionFrame>
            <SectionTitle>Week</SectionTitle>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-md border border-border p-1.5"
                aria-label="Previous week"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-medium">{formatWeekRange(weekStart)}</div>
              <button
                type="button"
                className="rounded-md border border-border p-1.5"
                aria-label="Next week"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="text-xs text-sky-700 hover:underline"
                onClick={() => setWeekStart(weekStartMonday())}
              >
                This week
              </button>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TIMESHEET_STATUS_CLASS[status]}`}
              >
                {TIMESHEET_STATUS_LABEL[status]}
              </span>
            </div>
            {!myResource && (
              <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Your login is not linked to a resource. Ask an org admin to open{" "}
                {isAdmin ? (
                  <button
                    type="button"
                    className="underline font-semibold"
                    onClick={() => setTabNav("setup")}
                  >
                    Resource setup
                  </button>
                ) : (
                  <strong>Timesheets → Resource setup</strong>
                )}{" "}
                and set <em>Linked user</em> plus <em>Resource Manager</em>.
              </p>
            )}
            {myResource && !myResource.manager_user_id && (
              <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                No Resource Manager on your profile — submission will be blocked until an admin assigns one.
              </p>
            )}
            {status === "rejected" && sheet?.rejection_reason && (
              <p className="mt-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                Rejected: {sheet.rejection_reason}
              </p>
            )}
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Summary</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Assigned work items" value={assignedWorkItems.length} />
              <KpiCard label="Hours this week" value={Math.round(weekTotal * 10) / 10} />
              <KpiCard
                label="Manager"
                value={
                  myResource?.manager_user_id
                    ? memberLabel(memberById.get(myResource.manager_user_id) || {
                        id: myResource.manager_user_id,
                        full_name: null,
                        email: null,
                      })
                    : "—"
                }
              />
              <KpiCard
                label="Approval step"
                value={
                  status === "pending_pm"
                    ? "1 · PM"
                    : status === "pending_rm"
                      ? "2 · RM"
                      : status === "approved"
                        ? "Done"
                        : "—"
                }
              />
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Hours by work item</SectionTitle>
            {sheetLoading || resourcesLoading ? (
              <PageLoading label="Loading timesheet…" fullScreen={false} />
            ) : assignedWorkItems.length === 0 && Object.keys(draftRows).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No assigned work items. Ask a PM to assign you on Work Items — those rows appear here as
                placeholders.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="st-table text-xs">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Work item</th>
                      {DAY_LABELS.map((d) => (
                        <th key={d} className="w-14 text-center">
                          {d}
                        </th>
                      ))}
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(draftRows).map((wiId) => {
                      const wi = workById.get(wiId);
                      const proj = wi ? projectById.get(wi.project_id) : null;
                      const row = draftRows[wiId];
                      return (
                        <tr key={wiId}>
                          <td className="whitespace-nowrap font-medium">
                            {(proj as any)?.project_code || "—"}
                          </td>
                          <td className="min-w-[14rem]">
                            <div className="font-medium text-foreground">
                              {wi?.wbs_code ? `${wi.wbs_code} · ` : ""}
                              {wi?.title || wiId.slice(0, 8)}
                            </div>
                            {wi?.status ? (
                              <div className="text-[10px] text-muted-foreground">{wi.status}</div>
                            ) : null}
                          </td>
                          {DAY_KEYS.map((dk) => (
                            <td key={dk}>
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step={0.25}
                                disabled={!editable}
                                className="st-input !w-14 !py-0.5 !px-1 text-center"
                                value={row[dk] || ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                                  setDraftRows((prev) => ({
                                    ...prev,
                                    [wiId]: { ...prev[wiId], [dk]: Number.isFinite(v) ? v : 0 },
                                  }));
                                }}
                              />
                            </td>
                          ))}
                          <td className="text-right font-semibold tabular-nums">
                            {entryWeekTotal(row).toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="font-semibold">
                        Week total
                      </td>
                      <td colSpan={7} />
                      <td className="text-right font-semibold tabular-nums">
                        {weekTotal.toFixed(1)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {editable && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="st-btn-secondary"
                  disabled={saveDraft.isPending}
                  onClick={() => saveDraft.mutate()}
                >
                  {saveDraft.isPending ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="st-btn-primary"
                  disabled={submit.isPending || saveDraft.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? "Submitting…" : "Submit for approval"}
                </button>
                <p className="w-full text-[11px] text-muted-foreground">
                  Sequence: (1) each Project Manager for projects on this sheet, then (2) your Resource
                  Manager.
                </p>
              </div>
            )}
          </SectionFrame>
        </>
      )}

      {tab === "approvals" && (
        <SectionFrame>
          <SectionTitle>Awaiting your action</SectionTitle>
          {pendingForMe.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No timesheets waiting for you.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingForMe.map((a) => {
                const s = sheetById.get(a.timesheet_id);
                if (!s) return null;
                const owner = memberById.get(s.user_id);
                const lines = approvalEntries.filter((e) => e.timesheet_id === s.id);
                const total = lines.reduce((sum, e) => sum + entryWeekTotal(e), 0);
                return (
                  <div
                    key={a.id}
                    className="rounded-lg border border-border bg-surface/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {memberLabel(
                            owner || { id: s.user_id, full_name: null, email: null },
                          )}{" "}
                          · {formatWeekRange(s.week_start)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Step:{" "}
                          {a.step === "pm"
                            ? `Project Manager${
                                a.project_id
                                  ? ` · ${(projectById.get(a.project_id) as any)?.project_code || ""}`
                                  : ""
                              }`
                            : "Resource Manager"}{" "}
                          · {total.toFixed(1)}h
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          disabled={act.isPending}
                          onClick={() =>
                            act.mutate({ approvalId: a.id, decision: "approved" })
                          }
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
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="st-table text-xs">
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Work item</th>
                            {DAY_LABELS.map((d) => (
                              <th key={d} className="text-center">
                                {d}
                              </th>
                            ))}
                            <th className="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((e) => {
                            const wi = workById.get(e.work_item_id);
                            const proj = projectById.get(e.project_id);
                            return (
                              <tr key={e.id}>
                                <td>{(proj as any)?.project_code || "—"}</td>
                                <td>{wi?.title || e.work_item_id.slice(0, 8)}</td>
                                {DAY_KEYS.map((dk) => (
                                  <td key={dk} className="text-center tabular-nums">
                                    {Number(e[dk]) || "·"}
                                  </td>
                                ))}
                                <td className="text-right tabular-nums font-medium">
                                  {entryWeekTotal(e).toFixed(1)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionFrame>
      )}

      {tab === "setup" && isAdmin && (
        <SectionFrame>
          <SectionTitle>Resource → user &amp; manager</SectionTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Every resource who fills timesheets needs a linked login and a nominated Resource Manager.
            Project Managers come from each project&apos;s PM field and approve first.
          </p>
          {resourcesLoading ? (
            <PageLoading label="Loading resources…" fullScreen={false} />
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Linked user</th>
                    <th>Resource Manager</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <ResourceSetupRow
                      key={r.id}
                      resource={r}
                      members={members}
                      saving={patchResource.isPending}
                      onSave={(user_id, manager_user_id) =>
                        patchResource.mutate({ id: r.id, user_id, manager_user_id })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>
      )}
    </PageExport>
  );
}

function ResourceSetupRow({
  resource,
  members,
  saving,
  onSave,
}: {
  resource: ResourceRow;
  members: OrgMember[];
  saving: boolean;
  onSave: (userId: string | null, managerId: string | null) => void;
}) {
  const [userId, setUserId] = useState(resource.user_id || "");
  const [managerId, setManagerId] = useState(resource.manager_user_id || "");

  useEffect(() => {
    setUserId(resource.user_id || "");
    setManagerId(resource.manager_user_id || "");
  }, [resource.user_id, resource.manager_user_id]);

  const dirty =
    (userId || null) !== (resource.user_id || null) ||
    (managerId || null) !== (resource.manager_user_id || null);

  return (
    <tr>
      <td>
        <div className="font-medium">{resource.name}</div>
        <div className="text-[10px] text-muted-foreground">{resource.email || "—"}</div>
      </td>
      <td>
        <select
          className="st-input !py-0.5 !text-xs min-w-[10rem]"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="st-input !py-0.5 !text-xs min-w-[10rem]"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        >
          <option value="">— None —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          type="button"
          className="st-btn-primary !py-1 !text-xs"
          disabled={!dirty || saving}
          onClick={() => onSave(userId || null, managerId || null)}
        >
          Save
        </button>
      </td>
    </tr>
  );
}
