import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Bell, BellRing } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { memberLabel, type OrgMember } from "@/lib/decision-approval";
import { addDays, formatWeekRange, weekStartMonday } from "@/lib/timesheet";
import {
  billableSummary,
  buildDetailRows,
  buildProjectEffortRows,
  buildUtilisationRows,
  downloadCsv,
  exportTimesheetReportsExcel,
  exportTimesheetReportsPdf,
  weeksInRange,
  type ReportEntry,
  type ReportResource,
  type ReportTimesheet,
} from "@/lib/timesheet-reports";

type Props = {
  orgId: string;
  orgName?: string | null;
  members: OrgMember[];
  projects: Array<{ id: string; name: string }>;
};

export function TimesheetReportsPanel({ orgId, orgName, members, projects }: Props) {
  const qc = useQueryClient();
  const thisWeek = weekStartMonday();
  const [fromWeek, setFromWeek] = useState(() => addDays(thisWeek, -21));
  const [toWeek, setToWeek] = useState(thisWeek);

  const weekStarts = useMemo(() => weeksInRange(fromWeek, toWeek), [fromWeek, toWeek]);
  const weekLabel =
    fromWeek === toWeek
      ? formatWeekRange(fromWeek)
      : `${formatWeekRange(fromWeek)} → ${formatWeekRange(toWeek)}`;

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const { data: resources = [], isLoading: resourcesLoading } = useQuery({
    queryKey: ["resources", orgId, "timesheet-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,user_id,capacity_hours_week,status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ReportResource[];
    },
    enabled: !!orgId,
  });

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery({
    queryKey: ["timesheets", orgId, "reports", fromWeek, toWeek],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheets" as any)
        .select("id,user_id,week_start,status")
        .gte("week_start", fromWeek <= toWeek ? fromWeek : toWeek)
        .lte("week_start", fromWeek <= toWeek ? toWeek : fromWeek)
        .order("week_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportTimesheet[];
    },
    enabled: !!orgId,
  });

  const sheetIds = useMemo(() => sheets.map((s) => s.id), [sheets]);

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["timesheet_entries", orgId, "reports", sheetIds.join(",")],
    queryFn: async () => {
      if (!sheetIds.length) return [] as ReportEntry[];
      // Chunk in case of many sheets
      const chunk = 200;
      const all: ReportEntry[] = [];
      for (let i = 0; i < sheetIds.length; i += chunk) {
        const ids = sheetIds.slice(i, i + chunk);
        const { data, error } = await supabase
          .from("timesheet_entries" as any)
          .select(
            "id,timesheet_id,project_id,work_item_id,billable,custom_task,hours_mon,hours_tue,hours_wed,hours_thu,hours_fri,hours_sat,hours_sun,labor_cost",
          )
          .in("timesheet_id", ids);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as ReportEntry[]));
      }
      return all;
    },
    enabled: !!orgId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "timesheet-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_items" as any)
        .select("id,title");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; title: string }[];
    },
    enabled: !!orgId,
  });

  const workById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems]);

  const { data: auditEvents = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit_events", orgId, "timesheet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events" as any)
        .select("id,created_at,actor_user_id,entity_type,action,summary,meta")
        .eq("org_id", orgId)
        .in("entity_type", ["timesheet", "timesheet_entry", "timesheet_approval"])
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        created_at: string;
        actor_user_id: string | null;
        entity_type: string;
        action: string;
        summary: string;
        meta: Record<string, unknown> | null;
      }>;
    },
    enabled: !!orgId,
  });

  const nameOf = (id: string) => {
    const m = memberById.get(id);
    return m ? memberLabel(m) : id.slice(0, 8);
  };

  const utilisation = useMemo(
    () =>
      buildUtilisationRows({
        sheets,
        entries,
        resources,
        weekStarts,
        memberName: nameOf,
      }),
    [sheets, entries, resources, weekStarts, memberById],
  );

  const projectEffort = useMemo(
    () =>
      buildProjectEffortRows({
        sheets,
        entries,
        weekStarts,
        projectName: (id) => (id ? projectById.get(id)?.name || id : "(None)"),
      }),
    [sheets, entries, weekStarts, projectById],
  );

  const details = useMemo(
    () =>
      buildDetailRows({
        sheets,
        entries,
        weekStarts,
        memberName: nameOf,
        projectName: (id) => (id ? projectById.get(id)?.name || id : ""),
        workItemTitle: (id) => (id ? workById.get(id)?.title || id : ""),
      }),
    [sheets, entries, weekStarts, memberById, projectById, workById],
  );

  const billable = useMemo(() => billableSummary(utilisation), [utilisation]);
  const avgUtil =
    utilisation.length > 0
      ? Math.round(
          (utilisation.reduce((s, r) => s + r.utilisation_pct, 0) / utilisation.length) * 10,
        ) / 10
      : 0;

  const missingCount = utilisation.filter((u) => u.total_hours === 0 || u.weeks === 0).length;

  const remindMissing = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("remind_missing_timesheets" as any, {
        _week_start: toWeek,
      });
      if (error) throw error;
      return data as { week_start?: string; notified?: number; skipped?: number };
    },
    onSuccess: (data) => {
      toast.success(
        `Reminders sent: ${data?.notified ?? 0} notified (${data?.skipped ?? 0} already ok / recently reminded)`,
      );
      qc.invalidateQueries({ queryKey: ["audit_events", orgId, "timesheet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remindApprovals = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("remind_pending_timesheet_approvals" as any);
      if (error) throw error;
      return data as { notified?: number; skipped?: number };
    },
    onSuccess: (data) => {
      toast.success(
        `Approval reminders: ${data?.notified ?? 0} sent (${data?.skipped ?? 0} skipped)`,
      );
      qc.invalidateQueries({ queryKey: ["audit_events", orgId, "timesheet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onExportCsv = () => {
    downloadCsv(
      `iProjectX_Timesheet_Detail_${fromWeek}_${toWeek}.csv`,
      [
        "week_start",
        "week_range",
        "person",
        "status",
        "billable",
        "project",
        "work_item",
        "hours_mon",
        "hours_tue",
        "hours_wed",
        "hours_thu",
        "hours_fri",
        "hours_sat",
        "hours_sun",
        "total_hours",
        "labor_cost",
      ],
      details,
    );
    toast.success("CSV downloaded");
  };

  const onExportExcel = async () => {
    try {
      await exportTimesheetReportsExcel({
        orgName,
        weekLabel,
        utilisation,
        projects: projectEffort,
        details,
      });
      toast.success("Excel workbook downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Excel export failed");
    }
  };

  const onExportPdf = async () => {
    try {
      await exportTimesheetReportsPdf({
        title: `${orgName || "Organisation"} — timesheet report`,
        weekLabel,
        utilisation,
        projects: projectEffort,
        billable,
      });
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  const loading = resourcesLoading || sheetsLoading || entriesLoading;

  return (
    <div className="space-y-4">
      <SectionFrame>
        <SectionTitle>Organisation reporting</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Team utilisation, billable vs non-billable hours, and project effort for the selected
          weeks. Exports support payroll, invoicing, and project reporting.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">From week (Mon)</span>
            <input
              type="date"
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              value={fromWeek}
              onChange={(e) => setFromWeek(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">To week (Mon)</span>
            <input
              type="date"
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              value={toWeek}
              onChange={(e) => setToWeek(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-xs text-sky-700 hover:underline"
            onClick={() => {
              setFromWeek(thisWeek);
              setToWeek(thisWeek);
            }}
          >
            This week
          </button>
          <button
            type="button"
            className="text-xs text-sky-700 hover:underline"
            onClick={() => {
              setFromWeek(addDays(thisWeek, -21));
              setToWeek(thisWeek);
            }}
          >
            Last 4 weeks
          </button>
          <div className="ml-auto flex flex-wrap gap-2" data-export-hide>
            <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void onExportExcel()}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void onExportPdf()}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{weekLabel}</p>
      </SectionFrame>

      {loading ? (
        <PageLoading label="Loading timesheet reports…" fullScreen={false} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total hours" value={billable.total} />
            <KpiCard
              label="Billable / non-billable"
              value={`${billable.billable} / ${billable.nonBillable}`}
            />
            <KpiCard label="Billable share" value={`${billable.billableShare}%`} />
            <KpiCard label="Avg utilisation" value={`${avgUtil}%`} />
          </div>

          <SectionFrame>
            <SectionTitle>Team utilisation</SectionTitle>
            <div className="overflow-x-auto">
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="text-right">Capacity</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Billable</th>
                    <th className="text-right">Non-billable</th>
                    <th className="text-right">Utilisation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {utilisation.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted-foreground">
                        No linked resources or timesheet data in this period.
                      </td>
                    </tr>
                  ) : (
                    utilisation.map((r) => (
                      <tr key={r.user_id}>
                        <td className="font-medium">{r.name}</td>
                        <td className="text-right tabular-nums">{r.capacity}</td>
                        <td className="text-right tabular-nums">{r.total_hours}</td>
                        <td className="text-right tabular-nums">{r.billable_hours}</td>
                        <td className="text-right tabular-nums">{r.non_billable_hours}</td>
                        <td className="text-right tabular-nums font-semibold">
                          {r.utilisation_pct}%
                        </td>
                        <td className="text-muted-foreground">{r.status_summary}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Project effort</SectionTitle>
            <div className="overflow-x-auto">
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="text-right">Billable</th>
                    <th className="text-right">Non-billable</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">People</th>
                    <th className="text-right">Labor cost</th>
                  </tr>
                </thead>
                <tbody>
                  {projectEffort.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground">
                        No project hours in this period.
                      </td>
                    </tr>
                  ) : (
                    projectEffort.map((r) => (
                      <tr key={r.project_id}>
                        <td className="font-medium">{r.project_name}</td>
                        <td className="text-right tabular-nums">{r.billable_hours}</td>
                        <td className="text-right tabular-nums">{r.non_billable_hours}</td>
                        <td className="text-right tabular-nums font-semibold">{r.total_hours}</td>
                        <td className="text-right tabular-nums">{r.people}</td>
                        <td className="text-right tabular-nums">{r.labor_cost}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionFrame>
        </>
      )}

      <SectionFrame>
        <SectionTitle>Notifications</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Approval requests already notify PMs and Resource Managers on submit. Use these actions
          to remind people with missing timesheets (week ending selection uses{" "}
          <strong>To week</strong>) or nudge pending approvers.
        </p>
        <div className="flex flex-wrap gap-2" data-export-hide>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={remindMissing.isPending}
            onClick={() => remindMissing.mutate()}
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Remind missing timesheets
            {missingCount ? ` (${missingCount} with no hours)` : ""}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={remindApprovals.isPending}
            onClick={() => remindApprovals.mutate()}
          >
            <BellRing className="mr-1.5 h-3.5 w-3.5" />
            Remind pending approvals
          </Button>
        </div>
      </SectionFrame>

      <SectionFrame>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Audit trail</SectionTitle>
          <Link
            to="/app/audit-log"
            className="text-xs font-semibold text-sky-700 hover:underline"
            data-export-hide
          >
            Open full audit log
          </Link>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Who created, edited, submitted, approved, or rejected timesheet entries — for compliance
          and accountability.
        </p>
        {auditLoading ? (
          <PageLoading label="Loading audit…" fullScreen={false} />
        ) : (
          <div className="overflow-x-auto">
            <table className="st-table text-xs">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground">
                      No timesheet audit events yet. They appear after create/edit/submit/approve
                      once the audit migration is applied.
                    </td>
                  </tr>
                ) : (
                  auditEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                      </td>
                      <td>
                        {e.actor_user_id ? nameOf(e.actor_user_id) : "—"}
                      </td>
                      <td>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
                          {e.entity_type}/{e.action}
                        </span>
                      </td>
                      <td>{e.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
