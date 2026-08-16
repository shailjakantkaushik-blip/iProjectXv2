import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageExport } from "@/components/page-export";
import { ColumnGlossary, type ColumnGlossaryItem } from "@/components/column-glossary";
import { PageLoading } from "@/components/page-loading";
import { memberLabel, type OrgMember } from "@/lib/decision-approval";
import { TimesheetReportsPanel } from "@/components/timesheet-reports-panel";
import { TimesheetApprovalsPanel } from "@/components/timesheet-approvals-panel";
import { ResourceAnalyticsPanels } from "@/components/resource-analytics-panels";
import { TimesheetWeekCalendar } from "@/components/timesheet-week-calendar";
import { useCapabilityPermission } from "@/lib/permissions";
import { RESOURCE_ALLOCATIONS_SELECT, RESOURCES_SELECT } from "@/lib/query-selects";
import {
  addDays,
  canEditTimesheet,
  canWithdrawTimesheet,
  DAY_KEYS,
  DAY_LABELS,
  entryWeekTotal,
  formatWeekRange,
  normalizeTimesheetStatus,
  TIMESHEET_STATUS_CLASS,
  TIMESHEET_STATUS_LABEL,
  weekStartMonday,
  mondaysOverlappingMonth,
  workItemMonthPlan,
  workItemWeekdayPlan,
  spreadHoursAcrossWeekdays,
  type DayKey,
  type TimesheetStatus,
} from "@/lib/timesheet";

type TimesheetTab = "mine" | "approvals" | "cost" | "reports" | "setup";
type TimesheetsSearch = { tab?: TimesheetTab };

export const Route = createFileRoute("/_authenticated/app/timesheets")({
  validateSearch: (s: Record<string, unknown>): TimesheetsSearch => ({
    tab:
      s.tab === "approvals" ||
      s.tab === "setup" ||
      s.tab === "mine" ||
      s.tab === "reports" ||
      s.tab === "cost"
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
  reopen_reason?: string | null;
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
  stream_id?: string | null;
  stage_gate_id?: string | null;
  estimate_hours?: number | null;
  actual_hours?: number | null;
  planned_start?: string | null;
  planned_end?: string | null;
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
  const proj = e.projects || (e.project_id ? projectById.get(e.project_id) : null);
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
  // Cost / reports / resource setup — capability::timesheet_cost_view (default: org admin + PM).
  // Full sync + link-user on setup remains org admin only.
  const isOrgAdmin = roles.some((r) => r === "admin" || r === "org_admin");
  const isPm = roles.includes("pm");
  const { canEdit: canViewCost } = useCapabilityPermission("timesheet_cost_view");
  const canAccessSetup = canViewCost && (isOrgAdmin || isPm);
  const canEditAllResources = isOrgAdmin;
  const setupOnlyTabs: TimesheetTab[] = ["setup"];
  const costTabs: TimesheetTab[] = ["cost", "reports"];

  const initialTab =
    search.tab && setupOnlyTabs.includes(search.tab) && !canAccessSetup
      ? "mine"
      : search.tab && costTabs.includes(search.tab) && !canViewCost
        ? "mine"
        : search.tab || "mine";
  const [tab, setTab] = useState<TimesheetTab>(initialTab);
  const [weekStart, setWeekStart] = useState(() => weekStartMonday());
  const [customTaskDraft, setCustomTaskDraft] = useState("");
  /** Calendar is the primary fill UX; Grid keeps the classic spreadsheet. */
  const [hoursView, setHoursView] = useState<"calendar" | "grid" | "month">("calendar");

  useEffect(() => {
    if (search.tab && setupOnlyTabs.includes(search.tab) && !canAccessSetup) {
      setTab("mine");
      navigate({ search: {}, replace: true });
      return;
    }
    if (search.tab && costTabs.includes(search.tab) && !canViewCost) {
      setTab("mine");
      navigate({ search: {}, replace: true });
      return;
    }
    if (search.tab) setTab(search.tab);
  }, [search.tab, canAccessSetup, canViewCost, navigate]);

  const setTabNav = (t: TimesheetTab) => {
    if (setupOnlyTabs.includes(t) && !canAccessSetup) return;
    if (costTabs.includes(t) && !canViewCost) return;
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

  /** Projects the user can edit (PM ownership / grants) — used to scope setup for PMs. */
  const { data: editableProjectIds = [] } = useQuery({
    queryKey: ["projects", orgId, "pm-editable-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,pm_user_id");
      if (error) throw error;
      const rows = (data ?? []) as { id: string; pm_user_id: string | null }[];
      if (isOrgAdmin) return rows.map((p) => p.id);
      return rows.filter((p) => p.pm_user_id === userId).map((p) => p.id);
    },
    enabled: !!orgId && canAccessSetup,
  });

  const { data: setupAllocations = [] } = useQuery({
    queryKey: ["resource_allocations", orgId, "setup-scope"],
    queryFn: async () => {
      if (!editableProjectIds.length) return [] as { resource_id: string; project_id: string }[];
      const { data, error } = await supabase
        .from("resource_allocations")
        .select("resource_id,project_id")
        .in("project_id", editableProjectIds);
      if (error) throw error;
      return (data ?? []) as { resource_id: string; project_id: string }[];
    },
    enabled: !!orgId && canAccessSetup && !canEditAllResources,
  });

  const setupResources = useMemo(() => {
    if (canEditAllResources) return resources;
    const allowed = new Set(setupAllocations.map((a) => a.resource_id));
    return resources.filter((r) => allowed.has(r.id));
  }, [resources, setupAllocations, canEditAllResources]);

  const myResource = useMemo(
    () => resources.find((r) => r.user_id === userId) || null,
    [resources, userId],
  );

  const { data: assignees = [] } = useQuery({
    queryKey: ["work_item_assignees", orgId, myResource?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_item_assignees" as any)
        .select("work_item_id,resource_id,user_id")
        .eq("resource_id", myResource!.id);
      if (error) throw error;
      return (data ?? []) as unknown as {
        work_item_id: string;
        resource_id: string;
        user_id: string | null;
      }[];
    },
    enabled: !!orgId && !!myResource?.id,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "timesheet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select(
          "id,project_id,stream_id,stage_gate_id,title,status,wbs_code,owner_user_id,estimate_hours,actual_hours,planned_start,planned_end",
        );
      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    enabled: !!orgId,
  });

  const assignedWorkItems = useMemo(() => {
    const ids = new Set(assignees.map((a) => a.work_item_id));
    return workItems.filter(
      (w) =>
        w.status !== "Cancelled" && (ids.has(w.id) || (!!userId && w.owner_user_id === userId)),
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

  const monthWeeks = useMemo(() => {
    const [y, mo] = weekStart.split("-").map(Number);
    return mondaysOverlappingMonth(y, mo - 1);
  }, [weekStart]);

  const { data: monthSheets = [] } = useQuery({
    queryKey: ["timesheets", orgId, userId, "month", monthWeeks.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheets" as any)
        .select("*")
        .eq("user_id", userId!)
        .in("week_start", monthWeeks);
      if (error) throw error;
      return (data ?? []) as unknown as Timesheet[];
    },
    enabled: !!orgId && !!userId && hoursView === "month",
  });

  const monthSheetIds = useMemo(() => monthSheets.map((s) => s.id), [monthSheets]);

  const { data: monthEntries = [] } = useQuery({
    queryKey: ["timesheet_entries", "month", monthSheetIds.join(",")],
    queryFn: async () => {
      if (!monthSheetIds.length) return [] as Entry[];
      const { data, error } = await supabase
        .from("timesheet_entries" as any)
        .select("*")
        .in("timesheet_id", monthSheetIds);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
    enabled: hoursView === "month",
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

  const ensureSheetForWeek = async (ws: string): Promise<string> => {
    if (!orgId || !userId) throw new Error("Not signed in");

    // Prefer cached row, then re-fetch — avoids duplicate insert when the
    // unique (org_id, user_id, week_start) row already exists but cache was empty.
    if (ws === weekStart && sheet?.id) return sheet.id;

    const existing = await supabase
      .from("timesheets" as any)
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("week_start", ws)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) return (existing.data as { id: string }).id;

    const { data, error } = await supabase
      .from("timesheets" as any)
      .insert({
        org_id: orgId,
        user_id: userId,
        resource_id: myResource?.id || null,
        week_start: ws,
        status: "draft",
        manager_user_id: myResource?.manager_user_id || null,
      } as never)
      .select("id")
      .single();

    if (error) {
      // Concurrent save/submit: another request created the row first.
      const code = (error as { code?: string }).code;
      if (code === "23505" || /duplicate key|unique constraint/i.test(error.message || "")) {
        const again = await supabase
          .from("timesheets" as any)
          .select("id")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .eq("week_start", ws)
          .maybeSingle();
        if (again.data?.id) return (again.data as { id: string }).id;
      }
      throw error;
    }
    return (data as unknown as { id: string }).id;
  };

  const ensureSheet = async (): Promise<string> => ensureSheetForWeek(weekStart);

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

  const saveMonth = useMutation({
    mutationFn: async (hoursByItemWeek: Record<string, Record<string, number>>) => {
      if (!orgId || !userId) throw new Error("Not signed in");
      if (!myResource) {
        throw new Error(
          "Link your login to a resource record (Setup tab / Resources) before saving timesheets.",
        );
      }
      let saved = 0;
      let skipped = 0;
      for (const ws of monthWeeks) {
        const existingSheet = monthSheets.find((s) => s.week_start === ws);
        if (existingSheet && !canEditTimesheet(existingSheet.status)) {
          skipped += 1;
          continue;
        }
        const weekRows: Record<string, unknown>[] = [];
        for (const wi of assignedWorkItems) {
          const hours = Number(hoursByItemWeek[wi.id]?.[ws] || 0);
          if (!(hours > 0)) continue;
          const perDay = spreadHoursAcrossWeekdays(hours);
          weekRows.push({
            org_id: orgId,
            billable: true,
            project_id: wi.project_id,
            work_item_id: wi.id,
            custom_task: null,
            notes: null,
            ...perDay,
          });
        }
        if (!weekRows.length && !existingSheet) continue;
        const sheetId = await ensureSheetForWeek(ws);
        const existing = await supabase
          .from("timesheet_entries" as any)
          .select("*")
          .eq("timesheet_id", sheetId);
        if (existing.error) throw existing.error;
        const keep = ((existing.data ?? []) as Entry[]).filter((e) => e.billable === false);
        const { error: delErr } = await supabase
          .from("timesheet_entries" as any)
          .delete()
          .eq("timesheet_id", sheetId);
        if (delErr) throw delErr;
        const payload = [
          ...weekRows.map((r) => ({ ...r, timesheet_id: sheetId })),
          ...keep.map((e) => ({
            org_id: orgId,
            timesheet_id: sheetId,
            billable: false,
            project_id: null,
            work_item_id: null,
            custom_task: e.custom_task,
            hours_mon: e.hours_mon || 0,
            hours_tue: e.hours_tue || 0,
            hours_wed: e.hours_wed || 0,
            hours_thu: e.hours_thu || 0,
            hours_fri: e.hours_fri || 0,
            hours_sat: e.hours_sat || 0,
            hours_sun: e.hours_sun || 0,
            notes: e.notes || null,
          })),
        ];
        if (payload.length) {
          const { error } = await supabase
            .from("timesheet_entries" as any)
            .insert(payload as never);
          if (error) throw error;
        }
        saved += 1;
      }
      return { saved, skipped };
    },
    onSuccess: ({ saved, skipped }) => {
      invalidate();
      toast.success(
        skipped
          ? `Saved ${saved} week${saved === 1 ? "" : "s"}; ${skipped} locked week${skipped === 1 ? "" : "s"} skipped`
          : `Saved timesheet for ${saved} week${saved === 1 ? "" : "s"}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!orgId || !userId) throw new Error("Not signed in");
      if (!myResource) {
        throw new Error("Link your login to a resource record before submitting timesheets.");
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
      const { data, error } = await supabase.rpc(
        "submit_timesheet" as any,
        {
          _timesheet_id: sheetId,
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Submitted — awaiting Project Manager, then Resource Manager");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      if (!sheet?.id) throw new Error("No timesheet");
      const { error } = await supabase.rpc(
        "withdraw_timesheet" as any,
        {
          _timesheet_id: sheet.id,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Timesheet withdrawn to draft");
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

  const syncResources = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sync_org_resources_from_profiles" as any, {
        _org_id: orgId,
      });
      if (error) throw error;
      return data as { created?: number; updated?: number };
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(
        `Resources synced (${data?.created ?? 0} created, ${data?.updated ?? 0} updated)`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weekTotal = useMemo(() => {
    return Object.values(draftRows).reduce((sum, r) => sum + entryWeekTotal(r), 0);
  }, [draftRows]);

  const setRowHours = (rowKey: string, dayKey: DayKey, hours: number) => {
    setDraftRows((prev) => {
      const row = prev[rowKey];
      if (!row) return prev;
      return { ...prev, [rowKey]: { ...row, [dayKey]: hours } };
    });
  };

  const applyWeekPlan = () => {
    let filled = 0;
    setDraftRows((prev) => {
      const next = { ...prev };
      for (const [key, row] of Object.entries(next)) {
        if (!row.billable || !row.work_item_id) continue;
        const wi = workById.get(row.work_item_id);
        if (!wi) continue;
        const { weekHours, perDay } = workItemWeekdayPlan({
          estimateHours: Number(wi.estimate_hours) || 0,
          actualHours: Number(wi.actual_hours) || 0,
          plannedStart: wi.planned_start,
          plannedEnd: wi.planned_end,
          weekStart,
        });
        if (!(weekHours > 0)) continue;
        next[key] = { ...row, ...perDay };
        filled += 1;
      }
      return next;
    });
    if (filled === 0) {
      toast.message("No week plan available — set planned hours/dates on work items first");
    } else {
      toast.success(`Applied week plan to ${filled} billable row${filled === 1 ? "" : "s"}`);
    }
  };

  const clearWeekHours = () => {
    if (!confirm("Clear all hours for this week? (rows stay; values go to 0)")) return;
    setDraftRows((prev) => {
      const next: typeof prev = {};
      for (const [key, row] of Object.entries(prev)) {
        next[key] = { ...row, ...emptyHours() };
      }
      return next;
    });
    toast.success("Cleared hours for this week");
  };

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
        subtitle="Fill hours in Calendar (day cards) or Grid view. Billable rows come from assigned work items; approval is PM → Resource Manager."
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mine", "My timesheet"],
                ["approvals", `Approvals${pendingForMe.length ? ` (${pendingForMe.length})` : ""}`],
                ...(canViewCost
                  ? ([
                      ["cost", "Cost quick view"],
                      ["reports", "Org reporting"],
                    ] as const)
                  : []),
                ...(canAccessSetup ? ([["setup", "Resource setup"]] as const) : []),
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
                {canAccessSetup ? (
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
                No Resource Manager on your profile — submission will be blocked until an admin
                assigns one.
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
                    ? memberLabel(
                        memberById.get(myResource.manager_user_id) || {
                          id: myResource.manager_user_id,
                          full_name: null,
                          email: null,
                        },
                      )
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>Hours — billable &amp; non-billable</SectionTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                      hoursView === "calendar"
                        ? "bg-sky-100 text-sky-800"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setHoursView("calendar")}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                      hoursView === "grid"
                        ? "bg-sky-100 text-sky-800"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setHoursView("grid")}
                  >
                    Grid
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                      hoursView === "month"
                        ? "bg-sky-100 text-sky-800"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setHoursView("month")}
                  >
                    Month
                  </button>
                </div>
                {editable ? (
                  <>
                    <button
                      type="button"
                      className="st-btn-secondary !px-2.5 !py-1 !text-[11px]"
                      onClick={applyWeekPlan}
                    >
                      Apply week plan
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:underline"
                      onClick={clearWeekHours}
                    >
                      Clear hours
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {sheetLoading || resourcesLoading ? (
              <PageLoading label="Loading timesheet…" fullScreen={false} />
            ) : Object.keys(draftRows).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No assigned work items yet. Ask a PM to assign you on Work Items for billable
                placeholders, or add a non-billable task below.
              </div>
            ) : hoursView === "month" ? (
              <TimesheetMonthPanel
                weekStart={weekStart}
                setWeekStart={setWeekStart}
                workItems={assignedWorkItems}
                monthSheets={monthSheets}
                monthEntries={monthEntries}
                saving={saveMonth.isPending}
                onOpenWeek={(ws) => {
                  setWeekStart(ws);
                  setHoursView("grid");
                }}
                onSaveMonth={(hours) => saveMonth.mutate(hours)}
              />
            ) : hoursView === "calendar" ? (
              <TimesheetWeekCalendar
                weekStart={weekStart}
                editable={editable}
                draftRows={draftRows}
                workById={workById}
                projectById={
                  projectById as Map<
                    string,
                    { id: string; name?: string | null; project_code?: string | null }
                  >
                }
                onChangeHours={setRowHours}
                onChangeCustomTask={(rowKey, value) =>
                  setDraftRows((prev) => ({
                    ...prev,
                    [rowKey]: { ...prev[rowKey], custom_task: value },
                  }))
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="st-table text-xs">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Project / task</th>
                      <th className="text-right whitespace-nowrap">Week plan</th>
                      {DAY_LABELS.map((d) => (
                        <th key={d} className="min-w-[3.75rem] text-center">
                          {d}
                        </th>
                      ))}
                      <th className="text-right">Week</th>
                      <th className="text-right">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(draftRows).map(([rowKey, row]) => {
                      const wi = row.work_item_id ? workById.get(row.work_item_id) : null;
                      const proj = row.project_id ? projectById.get(row.project_id) : null;
                      const plannedTotal = Number(wi?.estimate_hours) || 0;
                      const actualToDate = Number(wi?.actual_hours) || 0;
                      const weekHrs = entryWeekTotal(row);
                      const weekInActuals = normalizeTimesheetStatus(sheet?.status) === "approved";
                      // Pending: planned − approved actuals − this week's draft (until approved)
                      const left = Math.max(
                        0,
                        plannedTotal -
                          actualToDate -
                          (row.billable && !weekInActuals ? weekHrs : 0),
                      );
                      const { weekHours: weekPlan, perDay: dayPlan } = row.billable
                        ? workItemWeekdayPlan({
                            estimateHours: plannedTotal,
                            actualHours: actualToDate,
                            plannedStart: wi?.planned_start,
                            plannedEnd: wi?.planned_end,
                            weekStart,
                          })
                        : { weekHours: 0, perDay: emptyHours() };
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
                                <div className="text-[10px] text-muted-foreground">
                                  {wi?.status ? `${wi.status}` : ""}
                                  {plannedTotal > 0
                                    ? `${wi?.status ? " · " : ""}Actual ${actualToDate.toFixed(1)}h of ${plannedTotal.toFixed(1)}h planned`
                                    : wi?.status
                                      ? ""
                                      : "No planned hours on work item"}
                                </div>
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
                          <td className="text-right tabular-nums text-muted-foreground">
                            {row.billable && weekPlan > 0 ? weekPlan.toFixed(1) : "—"}
                          </td>
                          {DAY_KEYS.map((dk, dayIdx) => {
                            const isWeekday = dayIdx < 5;
                            const dayPlanned = dayPlan[dk] || 0;
                            const hoursVal = Number(row[dk]) || 0;
                            return (
                              <td key={dk} className="align-top px-0.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={24}
                                  step={0.25}
                                  inputMode="decimal"
                                  disabled={!editable}
                                  title={
                                    row.billable && isWeekday && dayPlanned > 0
                                      ? `Work item week plan ≈ ${dayPlanned}h this day`
                                      : undefined
                                  }
                                  className="st-input st-input-hours"
                                  value={hoursVal > 0 ? hoursVal : ""}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      setRowHours(rowKey, dk, 0);
                                      return;
                                    }
                                    const v = Number(raw);
                                    if (!Number.isFinite(v)) return;
                                    setRowHours(rowKey, dk, Math.min(24, Math.max(0, v)));
                                  }}
                                />
                                {row.billable && isWeekday && dayPlanned > 0 ? (
                                  <div className="mt-0.5 text-center text-[9px] tabular-nums text-muted-foreground">
                                    plan {dayPlanned}
                                  </div>
                                ) : null}
                              </td>
                            );
                          })}
                          <td className="text-right font-semibold tabular-nums">
                            {weekHrs.toFixed(1)}
                          </td>
                          <td className="text-right tabular-nums text-muted-foreground">
                            {row.billable && plannedTotal > 0 ? left.toFixed(1) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="font-semibold">
                        Week total
                      </td>
                      <td colSpan={7} />
                      <td className="text-right font-semibold tabular-nums">
                        {weekTotal.toFixed(1)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {editable && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[14rem] flex-1">
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Add non-billable task
                  </div>
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
            {!editable && sheet && canWithdrawTimesheet(sheet.status) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="st-btn-secondary"
                  disabled={withdraw.isPending}
                  onClick={() => {
                    if (!confirm("Withdraw this timesheet from approval and return it to draft?")) {
                      return;
                    }
                    withdraw.mutate();
                  }}
                >
                  {withdraw.isPending ? "Withdrawing…" : "Withdraw to draft"}
                </button>
                <p className="w-full text-[11px] text-muted-foreground">
                  Withdraw cancels pending approval steps so you can edit hours and resubmit.
                </p>
              </div>
            )}
            {sheet?.reopen_reason && status === "draft" && (
              <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Reopened by an approver
                {sheet.reopen_reason ? `: ${sheet.reopen_reason}` : "."} Edit and resubmit when
                ready.
              </p>
            )}
          </SectionFrame>
        </>
      )}

      {tab === "approvals" && orgId && userId && (
        <TimesheetApprovalsPanel
          orgId={orgId}
          userId={userId}
          members={members}
          projects={projects as any}
          resources={resources.map((r) => ({
            id: r.id,
            name: r.name,
            user_id: r.user_id,
          }))}
          workItems={workItems.map((w) => ({
            id: w.id,
            title: w.title,
            wbs_code: w.wbs_code,
          }))}
        />
      )}

      {tab === "cost" && canViewCost && orgId && <TimesheetCostQuickView />}

      {tab === "reports" && canViewCost && orgId && (
        <TimesheetReportsPanel
          orgId={orgId}
          orgName={organization?.name}
          members={members}
          projects={projects.map((p: any) => ({
            id: p.id,
            name: p.project_code ? `${p.project_code} — ${p.name}` : p.name || p.id,
          }))}
          showCost={canViewCost}
        />
      )}

      {tab === "setup" && canAccessSetup && (
        <SectionFrame>
          <SectionTitle>
            Resource setup {canEditAllResources ? "(org admin)" : "(your project team)"}
          </SectionTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            {canEditAllResources ? (
              <>
                Each org member is the same person as their resource (auto-synced). Set hourly cost
                and Resource Manager here. Billable timesheet hours × rate add to{" "}
                <strong>OPEX Labor / FTE</strong> and total OpEx actual for the work item&apos;s
                project / stream (other OpEx can still be entered separately).
              </>
            ) : (
              <>
                Project Managers can set hourly cost and Resource Manager for people allocated to
                projects they manage. Org-wide sync and user linking stay with Org Admins. Cost
                figures respect project visibility / permissions.
              </>
            )}
          </p>
          {canEditAllResources && (
            <div className="mb-3 flex flex-wrap gap-2" data-export-hide>
              <button
                type="button"
                className="st-btn-secondary text-xs"
                disabled={syncResources.isPending}
                onClick={() => syncResources.mutate()}
              >
                {syncResources.isPending ? "Syncing…" : "Sync members → resources"}
              </button>
            </div>
          )}
          {resourcesLoading ? (
            <PageLoading label="Loading resources…" fullScreen={false} />
          ) : setupResources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canEditAllResources
                ? "No resources yet. Sync members to create them."
                : "No resources allocated to your projects yet."}
            </p>
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
                  {setupResources.map((r) => (
                    <ResourceSetupRow
                      key={r.id}
                      resource={r}
                      members={members}
                      saving={patchResource.isPending}
                      allowLinkUser={canEditAllResources}
                      onSave={(user_id, manager_user_id, cost_rate) =>
                        patchResource.mutate({
                          id: r.id,
                          user_id: canEditAllResources ? user_id : r.user_id,
                          manager_user_id,
                          cost_rate,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionFrame>
      )}

      {tab === "mine" ? (
        <ColumnGlossary
          title="Timesheet hours — column reference"
          items={TIMESHEET_HOURS_GLOSSARY}
        />
      ) : null}
      {tab === "cost" && canViewCost ? (
        <ColumnGlossary
          title="Cost quick view — column reference"
          items={TIMESHEET_COST_GLOSSARY}
        />
      ) : null}
      {tab === "setup" && canAccessSetup ? (
        <ColumnGlossary
          title="Resource setup — column reference"
          items={TIMESHEET_SETUP_GLOSSARY}
        />
      ) : null}
    </PageExport>
  );
}

const TIMESHEET_HOURS_GLOSSARY: ColumnGlossaryItem[] = [
  {
    name: "Calendar / Grid",
    description:
      "Calendar = day cards with hour inputs (default). Grid = classic spreadsheet. Same data; switch anytime.",
  },
  {
    name: "Apply week plan",
    description:
      "Fills billable rows from each work item’s suggested Mon–Fri hours for this week (from planned hours/dates).",
  },
  {
    name: "Day strip",
    description:
      "Mon–Sun totals at a glance. Tap a day to focus that card; totals over 8h highlight amber.",
  },
  {
    name: "Type",
    description: "Billable (work item) or Non-billable (custom task).",
  },
  {
    name: "Project / task",
    description:
      "Project code and work-item title (billable), or the free-text non-billable task name.",
  },
  {
    name: "Week plan",
    description:
      "Suggested hours for this week from the work item (date-window share, or remaining paced across Mon–Fri when dates miss this week).",
  },
  {
    name: "Mon–Sun",
    description: "Hours logged for each weekday in the selected week.",
  },
  {
    name: "Week",
    description: "Sum of hours entered for this row in the current week.",
  },
  {
    name: "Left",
    description:
      "Remaining planned effort: Planned − approved actuals − this week’s draft (for billable rows still unapproved).",
  },
];

const TIMESHEET_COST_GLOSSARY: ColumnGlossaryItem[] = [
  {
    name: "Dimension",
    description:
      "Grouping row label (project, stream, resource, stage gate, or month — based on view).",
  },
  {
    name: "Alloc h",
    description: "Hours from Resource Allocation plans for the filtered scope.",
  },
  {
    name: "Demand h",
    description: "Work-item planned hours (demand) rolled up to the same dimension.",
  },
  {
    name: "Gap h",
    description:
      "Alloc h − Demand h (positive = spare allocation; negative = over-planned demand).",
  },
  {
    name: "Actual h",
    description: "Approved timesheet hours attributed to that dimension.",
  },
  {
    name: "Var h",
    description: "Demand h − Actual h (remaining demand vs timesheet actuals).",
  },
  {
    name: "Util%",
    description: "Utilization of allocated hours by actuals (when allocation exists).",
  },
  {
    name: "Status",
    description: "Traffic-light status from gap / variance thresholds (On track, Watch, Over).",
  },
  {
    name: "Demand FTE $",
    description: "Demand labor cost from work-item hours × assignee cost rates (not Planned FTE).",
  },
  {
    name: "Actual FTE $",
    description: "Actual labor cost from approved timesheet hours × resource cost rates.",
  },
];

const TIMESHEET_SETUP_GLOSSARY: ColumnGlossaryItem[] = [
  {
    name: "Resource",
    description: "People record used for allocations, work-item assignment, and costing.",
  },
  {
    name: "Linked user",
    description: "Login profile tied to this resource (required for timesheet placeholders).",
  },
  {
    name: "Resource Manager",
    description:
      "Approver for the second approval step (after Project Manager on billable sheets).",
  },
  {
    name: "Hourly cost",
    description: "Cost rate ($/h) used for Plan/Actual FTE $ and OPEX labor roll-ups.",
  },
];

function TimesheetCostQuickView() {
  const { organization } = useAuth();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", organization?.id, "ts-cost"],
    queryFn: async () =>
      (
        await supabase
          .from("projects")
          .select("id,name,project_code,program,portfolio")
          .order("project_code")
      ).data ?? [],
    enabled: !!organization,
  });
  const { data: resources = [] } = useQuery({
    queryKey: ["resources", organization?.id, "ts-cost"],
    queryFn: async () =>
      ((await supabase.from("resources").select(RESOURCES_SELECT as "*")).data as any[]) ?? [],
    enabled: !!organization,
  });
  const { data: allocations = [] } = useQuery({
    queryKey: ["resource_allocations", organization?.id, "ts-cost"],
    queryFn: async () =>
      ((await supabase.from("resource_allocations").select(RESOURCE_ALLOCATIONS_SELECT as "*"))
        .data as any[]) ?? [],
    enabled: !!organization,
  });

  return (
    <ResourceAnalyticsPanels
      mode="cost"
      projects={projects as any}
      resources={resources}
      allocations={allocations}
    />
  );
}

function ResourceSetupRow({
  resource,
  members,
  saving,
  allowLinkUser = true,
  onSave,
}: {
  resource: ResourceRow;
  members: OrgMember[];
  saving: boolean;
  /** Org admins can re-link login users; PMs keep the existing link. */
  allowLinkUser?: boolean;
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
    (allowLinkUser && (userId || null) !== (resource.user_id || null)) ||
    (managerId || null) !== (resource.manager_user_id || null) ||
    (nextRate ?? null) !== (resource.cost_rate ?? null);

  const linkedLabel = resource.user_id
    ? memberLabel(
        members.find((m) => m.id === resource.user_id) || {
          id: resource.user_id,
          full_name: null,
          email: null,
        },
      )
    : "— None —";

  return (
    <tr>
      <td>
        <div className="font-medium">{resource.name}</div>
        <div className="text-[10px] text-muted-foreground">{resource.email || "—"}</div>
      </td>
      <td>
        {allowLinkUser ? (
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
        ) : (
          <span className="text-xs text-muted-foreground">{linkedLabel}</span>
        )}
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
            onSave(
              allowLinkUser ? userId || null : resource.user_id,
              managerId || null,
              nextRate != null && Number.isFinite(nextRate) ? nextRate : null,
            )
          }
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function TimesheetMonthPanel({
  weekStart,
  setWeekStart,
  workItems,
  monthSheets,
  monthEntries,
  saving,
  onOpenWeek,
  onSaveMonth,
}: {
  weekStart: string;
  setWeekStart: (w: string) => void;
  workItems: WorkItem[];
  monthSheets: Timesheet[];
  monthEntries: Entry[];
  saving: boolean;
  onOpenWeek: (weekStart: string) => void;
  onSaveMonth: (hours: Record<string, Record<string, number>>) => void;
}) {
  const [y, m] = weekStart.split("-").map(Number);
  const monthIndex = m - 1;
  const weeks = mondaysOverlappingMonth(y, monthIndex);
  const label = new Date(y, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const sheetByWeek = useMemo(
    () => new Map(monthSheets.map((s) => [s.week_start, s])),
    [monthSheets],
  );
  const [hours, setHours] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const next: Record<string, Record<string, number>> = {};
    for (const wi of workItems) next[wi.id] = {};
    const sheetWeek = new Map(monthSheets.map((s) => [s.id, s.week_start]));
    for (const e of monthEntries) {
      if (e.billable === false || !e.work_item_id) continue;
      const ws = sheetWeek.get(e.timesheet_id);
      if (!ws) continue;
      if (!next[e.work_item_id]) next[e.work_item_id] = {};
      next[e.work_item_id][ws] = entryWeekTotal(e);
    }
    setHours(next);
  }, [workItems, monthSheets, monthEntries]);

  const applyMonthPlan = () => {
    let filled = 0;
    setHours((prev) => {
      const next = { ...prev };
      for (const wi of workItems) {
        const plan = workItemMonthPlan({
          estimateHours: Number(wi.estimate_hours) || 0,
          actualHours: Number(wi.actual_hours) || 0,
          plannedStart: wi.planned_start,
          plannedEnd: wi.planned_end,
          year: y,
          monthIndex,
        });
        const row = { ...(next[wi.id] || {}) };
        for (const w of weeks) {
          const sheet = sheetByWeek.get(w);
          if (sheet && !canEditTimesheet(sheet.status)) continue;
          if ((plan.byWeek[w] || 0) > 0) {
            row[w] = plan.byWeek[w];
            filled += 1;
          }
        }
        next[wi.id] = row;
      }
      return next;
    });
    if (filled === 0) {
      toast.message("No month plan available — set planned hours/dates on work items first");
    } else {
      toast.success("Applied planned hours across the month");
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="st-btn-secondary !px-2 !py-1 !text-xs"
            onClick={() => setWeekStart(weekStartMonday(new Date(y, monthIndex - 1, 1)))}
          >
            Prev month
          </button>
          <strong className="text-sm">{label}</strong>
          <button
            type="button"
            className="st-btn-secondary !px-2 !py-1 !text-xs"
            onClick={() => setWeekStart(weekStartMonday(new Date(y, monthIndex + 1, 1)))}
          >
            Next month
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter hours for every week in the month. Planned hours come from each work item. Submitted
          weeks stay locked.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="st-table text-xs">
          <thead>
            <tr>
              <th>Work item</th>
              <th className="text-right">Month plan</th>
              {weeks.map((w) => {
                const sheet = sheetByWeek.get(w);
                const locked = sheet ? !canEditTimesheet(sheet.status) : false;
                return (
                  <th key={w} className="text-right whitespace-nowrap">
                    <button type="button" className="underline" onClick={() => onOpenWeek(w)}>
                      Wk {w.slice(5)}
                    </button>
                    {locked && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {TIMESHEET_STATUS_LABEL[normalizeTimesheetStatus(sheet?.status)]}
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="text-right">Entered</th>
            </tr>
          </thead>
          <tbody>
            {workItems.map((wi) => {
              const plan = workItemMonthPlan({
                estimateHours: Number(wi.estimate_hours) || 0,
                actualHours: Number(wi.actual_hours) || 0,
                plannedStart: wi.planned_start,
                plannedEnd: wi.planned_end,
                year: y,
                monthIndex,
              });
              const entered = weeks.reduce((s, w) => s + (Number(hours[wi.id]?.[w]) || 0), 0);
              return (
                <tr key={wi.id}>
                  <td className="font-medium">{wi.title}</td>
                  <td className="text-right tabular-nums font-semibold">{plan.monthHours}</td>
                  {weeks.map((w) => {
                    const sheet = sheetByWeek.get(w);
                    const locked = sheet ? !canEditTimesheet(sheet.status) : false;
                    return (
                      <td key={w} className="text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          className="st-input !w-16 !py-0.5 text-right"
                          disabled={locked}
                          value={hours[wi.id]?.[w] ?? ""}
                          placeholder={String(plan.byWeek[w] || "")}
                          onChange={(e) => {
                            const v = e.target.value === "" ? 0 : Number(e.target.value);
                            setHours((prev) => ({
                              ...prev,
                              [wi.id]: { ...(prev[wi.id] || {}), [w]: Number.isFinite(v) ? v : 0 },
                            }));
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums font-semibold">
                    {Math.round(entered * 100) / 100}
                  </td>
                </tr>
              );
            })}
            {workItems.length === 0 && (
              <tr>
                <td colSpan={weeks.length + 3} className="py-4 text-center text-muted-foreground">
                  No assigned work items for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="st-btn-secondary !text-xs" onClick={applyMonthPlan}>
          Apply month plan
        </button>
        <button
          type="button"
          className="st-btn-primary !text-xs"
          disabled={saving || workItems.length === 0}
          onClick={() => onSaveMonth(hours)}
        >
          {saving ? "Saving…" : "Save entire month"}
        </button>
      </div>
    </div>
  );
}
