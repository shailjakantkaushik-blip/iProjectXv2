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
import { TimesheetReportsPanel } from "@/components/timesheet-reports-panel";

type TimesheetTab = "mine" | "approvals" | "reports" | "setup";
type TimesheetsSearch = { tab?: TimesheetTab };

export const Route = createFileRoute("/_authenticated/app/timesheets")({
  validateSearch: (s: Record<string, unknown>): TimesheetsSearch => ({
    tab:
      s.tab === "approvals" || s.tab === "setup" || s.tab === "mine" || s.tab === "reports"
        ? (s.tab as TimesheetTab)
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
  /** Joined when loading approval rows */
  work_items?: { id: string; title: string | null; wbs_code: string | null } | null;
  projects?: { id: string; name: string | null; project_code: string | null } | null;
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
  cost_rate: number | null;
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

function workItemTitle(
  e: Pick<Entry, "work_item_id" | "work_items" | "custom_task" | "billable">,
  workById: Map<string, WorkItem>,
): string {
  if (e.billable === false) return e.custom_task?.trim() || "Custom task";
  const joined = e.work_items?.title?.trim();
  if (joined) return joined;
  const wi = e.work_item_id ? workById.get(e.work_item_id) : null;
  if (wi?.title?.trim()) return wi.title.trim();
  if (wi?.wbs_code) return `WBS ${wi.wbs_code}`;
  if (e.work_items?.wbs_code) return `WBS ${e.work_items.wbs_code}`;
  return "Work item";
}

function projectTaskLabel(
  e: Entry,
  workById: Map<string, WorkItem>,
  projectById: Map<string, { id: string; name?: string | null; project_code?: string | null }>,
): string {
  if (e.billable === false) return `Non-billable · ${workItemTitle(e, workById)}`;
  const proj =
    e.projects ||
    (e.project_id ? projectById.get(e.project_id) : null);
  const code = (proj as any)?.project_code || (proj as any)?.name || "—";
  return `${code} · ${workItemTitle(e, workById)}`;
}

function TimesheetsPage() {
  const { organization, session, roles } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  // Resource setup + org reporting — org admins only
  const canManageSetup = roles.some((r) => r === "admin" || r === "org_admin");
  const adminOnlyTabs: TimesheetTab[] = ["setup", "reports"];

  const initialTab =
    search.tab && adminOnlyTabs.includes(search.tab) && !canManageSetup
      ? "mine"
      : search.tab || "mine";
  const [tab, setTab] = useState<TimesheetTab>(initialTab);
  const [weekStart, setWeekStart] = useState(() => weekStartMonday());
  const [customTaskDraft, setCustomTaskDraft] = useState("");

  useEffect(() => {
    if (search.tab && adminOnlyTabs.includes(search.tab) && !canManageSetup) {
      setTab("mine");
      navigate({ search: {}, replace: true });
      return;
    }
    if (search.tab) setTab(search.tab);
  }, [search.tab, canManageSetup, navigate]);

  const setTabNav = (t: TimesheetTab) => {
    if (adminOnlyTabs.includes(t) && !canManageSetup) return;
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
        .select("id,name,email,user_id,manager_user_id,cost_rate,status")
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
        .select("id,project_id,title,status,wbs_code,owner_user_id");
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
        w.status !== "Cancelled" &&
        (ids.has(w.id) || w.owner_user_id === userId),
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
      const joined = await supabase
        .from("timesheet_entries" as any)
        .select(
          "id,timesheet_id,project_id,work_item_id,billable,custom_task,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun,notes,labor_cost,work_items(id,title,wbs_code),projects(id,name,project_code)",
        )
        .in("timesheet_id", approvalSheetIds);
      if (!joined.error) return (joined.data ?? []) as unknown as Entry[];

      // Fallback if embed relationship is unavailable in schema cache
      const { data, error } = await supabase
        .from("timesheet_entries" as any)
        .select("*")
        .in("timesheet_id", approvalSheetIds);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Entry[];
      const wiIds = [...new Set(rows.map((r) => r.work_item_id).filter(Boolean))] as string[];
      if (wiIds.length === 0) return rows;
      const { data: wis } = await supabase
        .from("work_items" as any)
        .select("id,title,wbs_code")
        .in("id", wiIds);
      const byId = new Map(
        ((wis ?? []) as unknown as { id: string; title: string | null; wbs_code: string | null }[]).map(
          (w) => [w.id, w],
        ),
      );
      return rows.map((r) => ({
        ...r,
        work_items: r.work_item_id ? byId.get(r.work_item_id) || null : null,
      }));
    },
    enabled: approvalSheetIds.length > 0,
  });

  const projectById = useMemo(() => new Map(projects.map((p: any) => [p.id, p])), [projects]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const workById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems]);
  const sheetById = useMemo(() => new Map(approvalSheets.map((s) => [s.id, s])), [approvalSheets]);

  const editable = canEditTimesheet(sheet?.status);

  type DraftRow = Record<DayKey, number> & {
    notes: string;
    billable: boolean;
    work_item_id: string | null;
    project_id: string | null;
    custom_task: string;
  };

  /** Draft rows: billable placeholders from assignments + non-billable custom tasks. */
  const [draftRows, setDraftRows] = useState<Record<string, DraftRow>>({});

  useEffect(() => {
    const next: Record<string, DraftRow> = {};
    for (const wi of assignedWorkItems) {
      const existing = entries.find((e) => e.billable !== false && e.work_item_id === wi.id);
      next[`b:${wi.id}`] = {
        ...emptyHours(),
        billable: true,
        work_item_id: wi.id,
        project_id: wi.project_id,
        custom_task: "",
        notes: "",
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
          : {}),
      };
    }
    for (const e of entries) {
      if (e.billable === false) {
        const key = `nb:${e.id}`;
        next[key] = {
          ...emptyHours(),
          billable: false,
          work_item_id: null,
          project_id: e.project_id,
          custom_task: e.custom_task || "",
          hours_mon: Number(e.hours_mon) || 0,
          hours_tue: Number(e.hours_tue) || 0,
          hours_wed: Number(e.hours_wed) || 0,
          hours_thu: Number(e.hours_thu) || 0,
          hours_fri: Number(e.hours_fri) || 0,
          hours_sat: Number(e.hours_sat) || 0,
          hours_sun: Number(e.hours_sun) || 0,
          notes: e.notes || "",
        };
      } else if (e.work_item_id && !next[`b:${e.work_item_id}`]) {
        next[`b:${e.work_item_id}`] = {
          ...emptyHours(),
          billable: true,
          work_item_id: e.work_item_id,
          project_id: e.project_id,
          custom_task: "",
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

  const buildEntryPayload = (orgId: string, sheetId: string) => {
    const rows: Record<string, unknown>[] = [];
    for (const row of Object.values(draftRows)) {
      const total = entryWeekTotal(row);
      if (row.billable) {
        if (!row.work_item_id || !row.project_id) continue;
        if (total <= 0 && !row.notes) continue;
        rows.push({
          org_id: orgId,
          timesheet_id: sheetId,
          billable: true,
          project_id: row.project_id,
          work_item_id: row.work_item_id,
          custom_task: null,
          hours_mon: row.hours_mon || 0,
          hours_tue: row.hours_tue || 0,
          hours_wed: row.hours_wed || 0,
          hours_thu: row.hours_thu || 0,
          hours_fri: row.hours_fri || 0,
          hours_sat: row.hours_sat || 0,
          hours_sun: row.hours_sun || 0,
          notes: row.notes || null,
        });
      } else {
        const task = (row.custom_task || "").trim();
        if (!task) continue;
        rows.push({
          org_id: orgId,
          timesheet_id: sheetId,
          billable: false,
          project_id: null,
          work_item_id: null,
          custom_task: task,
          hours_mon: row.hours_mon || 0,
          hours_tue: row.hours_tue || 0,
          hours_wed: row.hours_wed || 0,
          hours_thu: row.hours_thu || 0,
          hours_fri: row.hours_fri || 0,
          hours_sat: row.hours_sat || 0,
          hours_sun: row.hours_sun || 0,
          notes: row.notes || null,
        });
      }
    }
    return rows;
  };

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
      const rows = buildEntryPayload(orgId, sheetId);
      if (!rows.length) throw new Error("Add hours on a billable work item or a non-billable task");
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
      const rows = buildEntryPayload(orgId, sheetId);
      if (!rows.length) throw new Error("Add hours on a billable work item or a non-billable task");
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
      cost_rate,
    }: {
      id: string;
      user_id: string | null;
      manager_user_id: string | null;
      cost_rate: number | null;
    }) => {
      const { error } = await supabase
        .from("resources")
        .update({ user_id, manager_user_id, cost_rate } as never)
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
                ...(canManageSetup
                  ? ([
                      ["reports", "Org reporting"],
                      ["setup", "Resource setup"],
                    ] as const)
                  : []),
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
                {canManageSetup ? (
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
            <SectionTitle>Hours — billable &amp; non-billable</SectionTitle>
            {sheetLoading || resourcesLoading ? (
              <PageLoading label="Loading timesheet…" fullScreen={false} />
            ) : Object.keys(draftRows).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No assigned work items yet. Ask a PM to assign you on Work Items for billable
                placeholders, or add a non-billable task below.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="st-table text-xs">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Project / task</th>
                      {DAY_LABELS.map((d) => (
                        <th key={d} className="w-14 text-center">
                          {d}
                        </th>
                      ))}
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(draftRows).map(([rowKey, row]) => {
                      const wi = row.work_item_id ? workById.get(row.work_item_id) : null;
                      const proj = row.project_id ? projectById.get(row.project_id) : null;
                      return (
                        <tr key={rowKey}>
                          <td className="whitespace-nowrap">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                row.billable
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {row.billable ? "Billable" : "Non-billable"}
                            </span>
                          </td>
                          <td className="min-w-[14rem]">
                            {row.billable ? (
                              <>
                                <div className="font-medium">
                                  {(proj as any)?.project_code || "—"} ·{" "}
                                  {wi?.wbs_code ? `${wi.wbs_code} · ` : ""}
                                  {workItemTitle(
                                    {
                                      billable: true,
                                      work_item_id: row.work_item_id,
                                      custom_task: row.custom_task,
                                      work_items: null,
                                    },
                                    workById,
                                  )}
                                </div>
                                {wi?.status ? (
                                  <div className="text-[10px] text-muted-foreground">{wi.status}</div>
                                ) : null}
                              </>
                            ) : (
                              <input
                                className="st-input !py-0.5 !text-xs w-full"
                                disabled={!editable}
                                placeholder="Custom task (e.g. Training, Admin)"
                                value={row.custom_task}
                                onChange={(e) =>
                                  setDraftRows((prev) => ({
                                    ...prev,
                                    [rowKey]: { ...prev[rowKey], custom_task: e.target.value },
                                  }))
                                }
                              />
                            )}
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
                                    [rowKey]: {
                                      ...prev[rowKey],
                                      [dk]: Number.isFinite(v) ? v : 0,
                                    },
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
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[14rem] flex-1">
                  <div className="mb-1 text-[11px] text-muted-foreground">Add non-billable task</div>
                  <input
                    className="st-input !text-xs"
                    placeholder="e.g. Internal training"
                    value={customTaskDraft}
                    onChange={(e) => setCustomTaskDraft(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="st-btn-secondary"
                  onClick={() => {
                    const task = customTaskDraft.trim();
                    if (!task) {
                      toast.error("Enter a task name");
                      return;
                    }
                    const key = `nb:new:${Date.now()}`;
                    setDraftRows((prev) => ({
                      ...prev,
                      [key]: {
                        ...emptyHours(),
                        billable: false,
                        work_item_id: null,
                        project_id: null,
                        custom_task: task,
                        notes: "",
                      },
                    }));
                    setCustomTaskDraft("");
                  }}
                >
                  Add task
                </button>
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
                  Billable rows need Project Manager approval first, then Resource Manager.
                  Non-billable-only sheets go straight to Resource Manager. Hourly cost on your
                  resource profile rolls approved billable hours into stream → project → portfolio
                  OpEx.
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
                            <th>Project / task</th>
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
                            return (
                              <tr key={e.id}>
                                <td>
                                  {projectTaskLabel(e, workById, projectById as Map<string, any>)}
                                </td>
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

      {tab === "reports" && canManageSetup && orgId && (
        <TimesheetReportsPanel
          orgId={orgId}
          orgName={organization?.name}
          members={members}
          projects={projects.map((p: any) => ({ id: p.id, name: p.name || p.id }))}
        />
      )}

      {tab === "setup" && canManageSetup && (
        <SectionFrame>
          <SectionTitle>Resource setup (org admin)</SectionTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Link each resource to a login, nominate a Resource Manager, and set the hourly cost rate.
            Approved billable timesheet hours × rate flow into monthly OpEx → project → portfolio.
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
                    <th>Hourly cost</th>
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
                      onSave={(user_id, manager_user_id, cost_rate) =>
                        patchResource.mutate({ id: r.id, user_id, manager_user_id, cost_rate })
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
  onSave: (userId: string | null, managerId: string | null, costRate: number | null) => void;
}) {
  const [userId, setUserId] = useState(resource.user_id || "");
  const [managerId, setManagerId] = useState(resource.manager_user_id || "");
  const [costRate, setCostRate] = useState(
    resource.cost_rate != null ? String(resource.cost_rate) : "",
  );

  useEffect(() => {
    setUserId(resource.user_id || "");
    setManagerId(resource.manager_user_id || "");
    setCostRate(resource.cost_rate != null ? String(resource.cost_rate) : "");
  }, [resource.user_id, resource.manager_user_id, resource.cost_rate]);

  const nextRate = costRate === "" ? null : Number(costRate);
  const dirty =
    (userId || null) !== (resource.user_id || null) ||
    (managerId || null) !== (resource.manager_user_id || null) ||
    (nextRate ?? null) !== (resource.cost_rate ?? null);

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
        <input
          type="number"
          min={0}
          step={0.01}
          className="st-input !w-24 !py-0.5 !text-xs"
          placeholder="0.00"
          value={costRate}
          onChange={(e) => setCostRate(e.target.value)}
        />
      </td>
      <td>
        <button
          type="button"
          className="st-btn-primary !py-1 !text-xs"
          disabled={!dirty || saving || (nextRate != null && !Number.isFinite(nextRate))}
          onClick={() =>
            onSave(userId || null, managerId || null, nextRate != null && Number.isFinite(nextRate) ? nextRate : null)
          }
        >
          Save
        </button>
      </td>
    </tr>
  );
}
