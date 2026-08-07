import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Check, X, ArrowRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DECISIONS_SELECT,
  ACTIONS_SELECT,
  WORK_ITEMS_SELECT,
  NOTIFICATIONS_SELECT,
  RESOURCES_SELECT,
} from "@/lib/query-selects";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  canActOnDecision,
  decisionOutcome,
  isAwaitingApproval,
  type DecisionOutcome,
} from "@/lib/decision-approval";

export const Route = createFileRoute("/_authenticated/app/my-work")({
  component: MyWorkPage,
});

function normPerson(s: string | null | undefined) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function MyWorkPage() {
  const { organization, session, profile } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () =>
      (await supabase.from("decisions").select(DECISIONS_SELECT as "*").order("decision_date", { ascending: false }))
        .data ?? [],
    enabled: !!orgId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId],
    queryFn: async () =>
      (await supabase.from("actions").select(ACTIONS_SELECT as "*").order("due_date")).data ?? [],
    enabled: !!orgId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId, "my-work"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_items" as any).select(WORK_ITEMS_SELECT);
      if (error) return [];
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  /** Profile → resources row (same link Work Items uses for assignee "mine"). */
  const { data: myResources = [] } = useQuery({
    queryKey: ["resources", orgId, "my-work", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select(RESOURCES_SELECT as "*")
        .eq("org_id", orgId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; email: string | null; user_id: string | null }[];
    },
    enabled: !!orgId && !!userId,
  });

  const myResourceIds = useMemo(() => new Set(myResources.map((r) => r.id)), [myResources]);

  /** Assignees for work items where I am on the team (by resource or user_id). */
  const { data: myAssignments = [] } = useQuery({
    queryKey: ["work_item_assignees", orgId, "my-work", userId, [...myResourceIds].join(",")],
    queryFn: async () => {
      if (!userId) return [];
      const resourceIds = [...myResourceIds];
      // Match either denormalized user_id on the assignee row, or my linked resource(s).
      let q = supabase
        .from("work_item_assignees" as any)
        .select("id,work_item_id,resource_id,user_id")
        .eq("org_id", orgId!);
      if (resourceIds.length) {
        q = q.or(
          `user_id.eq.${userId},resource_id.in.(${resourceIds.join(",")})`,
        );
      } else {
        q = q.eq("user_id", userId);
      }
      const { data, error } = await q;
      if (error) {
        // Fallback without org_id filter if column/cache lag
        const fallback = await supabase
          .from("work_item_assignees" as any)
          .select("id,work_item_id,resource_id,user_id");
        if (fallback.error) return [];
        return ((fallback.data ?? []) as unknown as any[]).filter(
          (a) =>
            a.user_id === userId || (a.resource_id && myResourceIds.has(a.resource_id)),
        );
      }
      return (data ?? []) as unknown as {
        id: string;
        work_item_id: string;
        resource_id: string | null;
        user_id: string | null;
      }[];
    },
    enabled: !!orgId && !!userId,
  });

  const assignedWorkItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of myAssignments) {
      if (
        a.user_id === userId ||
        (a.resource_id && myResourceIds.has(a.resource_id))
      ) {
        ids.add(a.work_item_id);
      }
    }
    return ids;
  }, [myAssignments, userId, myResourceIds]);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () =>
      (
        await supabase
          .from("notifications")
          .select(NOTIFICATIONS_SELECT)
          .eq("user_id", userId!)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(10)
      ).data ?? [],
    enabled: !!userId,
  });

  const { data: timesheetApprovals = [] } = useQuery({
    queryKey: ["timesheet_approvals", orgId, userId, "my-work"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheet_approvals" as any)
        .select("id,timesheet_id,step,status")
        .eq("approver_user_id", userId!)
        .eq("status", "pending");
      if (error) return [];
      return (data ?? []) as unknown as { id: string; timesheet_id: string; step: string; status: string }[];
    },
    enabled: !!orgId && !!userId,
  });

  const projectById = new Map(projects.map((p: any) => [p.id, p]));

  const awaitingDecisions = decisions.filter((d: any) => canActOnDecision(d, userId));
  const awaitingTimesheets = timesheetApprovals.length;

  const myName = normPerson(profile?.full_name);
  const myEmail = normPerson(profile?.email);
  const myFirst = myName.split(/\s+/)[0] || "";
  const resourceNames = useMemo(
    () => new Set(myResources.map((r) => normPerson(r.name)).filter(Boolean)),
    [myResources],
  );

  const myActions = actions.filter((a: any) => {
    if (a.status === "Closed" || a.status === "Done" || a.status === "Completed") return false;
    const owner = normPerson(a.owner);
    if (!owner) return false;
    if (myEmail && owner === myEmail) return true;
    if (myName && (owner === myName || owner.includes(myName))) return true;
    if (myFirst && myFirst.length > 2 && owner.includes(myFirst)) return true;
    if (resourceNames.has(owner)) return true;
    return false;
  });

  /** Owner OR team assignee — same rule as Work Items "mine" filter. */
  const myWork = useMemo(() => {
    return workItems
      .filter((w: any) => {
        if (w.status === "Done" || w.status === "Cancelled") return false;
        const owned = !!userId && w.owner_user_id === userId;
        const assigned = assignedWorkItemIds.has(w.id);
        return owned || assigned;
      })
      .map((w: any) => ({
        ...w,
        _role:
          userId && w.owner_user_id === userId
            ? ("Owner" as const)
            : ("Assignee" as const),
      }))
      .sort((a: any, b: any) => {
        const ae = a.planned_end || "9999";
        const be = b.planned_end || "9999";
        return String(ae).localeCompare(String(be));
      });
  }, [workItems, userId, assignedWorkItemIds]);

  const atRisk = projects.filter((p: any) => p.rag === "Red" || p.rag === "Amber");

  const decide = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: DecisionOutcome }) => {
      const { error } = await supabase
        .from("decisions")
        .update({
          outcome,
          status: outcome,
          decided_by: profile?.full_name || profile?.email || "Approver",
          approved_by: userId,
          approved_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["decisions", orgId] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(vars.outcome === "Approved" ? "Approved" : "Rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-in fade-in-0 duration-300">
      <PageHeading
        title="My Work"
        subtitle="Approvals, actions, and work items assigned to you (owner or team assignee)"
      />

      <SectionFrame>
        <SectionTitle>Command queue</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Approvals waiting" value={awaitingDecisions.length + awaitingTimesheets} />
          <KpiCard label="My open actions" value={myActions.length} />
          <KpiCard label="My work items" value={myWork.length} />
          <KpiCard label="Unread alerts" value={notifications.length} />
        </div>
        {!userId ? null : myResources.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Tip: link your profile to a Resources row (user) so team assignments on work items
            appear here automatically.
          </p>
        ) : null}
        {awaitingTimesheets > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Including{" "}
            <Link to="/app/timesheets" search={{ tab: "approvals" }} className="font-semibold text-primary hover:underline">
              {awaitingTimesheets} timesheet approval{awaitingTimesheets === 1 ? "" : "s"}
            </Link>
            .
          </p>
        )}
      </SectionFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionFrame>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Approvals inbox</SectionTitle>
            <Link to="/app/decisions" search={{ awaiting: "me" }} className="text-xs font-medium text-primary hover:underline">
              Open register
            </Link>
          </div>
          {awaitingDecisions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8 opacity-40" />
              Nothing waiting for your approval
            </div>
          ) : (
            <div className="space-y-2">
              {awaitingDecisions.slice(0, 8).map((d: any) => {
                const proj = projectById.get(d.project_id) as any;
                return (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border/80 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{d.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {proj?.project_code || "Project"} · {decisionOutcome(d)}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                          onClick={() => decide.mutate({ id: d.id, outcome: "Approved" })}
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
                          onClick={() => decide.mutate({ id: d.id, outcome: "Rejected" })}
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionFrame>

        <SectionFrame>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>At-risk portfolio</SectionTitle>
            <Link to="/app/executive" className="text-xs font-medium text-primary hover:underline">
              Dashboard
            </Link>
          </div>
          {atRisk.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No Red/Amber projects</div>
          ) : (
            <div className="space-y-2">
              {atRisk.slice(0, 8).map((p: any) => (
                <Link
                  key={p.id}
                  to="/app/projects/$id"
                  params={{ id: p.id }}
                  className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2.5 transition-colors hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.project_code}</div>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      p.rag === "Red"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {p.rag}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SectionFrame>

        <SectionFrame>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>My open actions</SectionTitle>
            <Link to="/app/actions" className="text-xs font-medium text-primary hover:underline">
              All actions
            </Link>
          </div>
          {myActions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No open actions assigned to you</div>
          ) : (
            <ul className="space-y-2">
              {myActions.slice(0, 8).map((a: any) => (
                <li key={a.id} className="rounded-lg border border-border/80 px-3 py-2 text-sm">
                  <div className="font-medium">{a.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {a.status} · due {a.due_date || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionFrame>

        <SectionFrame>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>My work items</SectionTitle>
            <Link
              to="/app/work-items"
              search={{ mine: true }}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open mine <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {myWork.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active work items where you are owner or assignee
            </div>
          ) : (
            <ul className="space-y-2">
              {myWork.slice(0, 12).map((w: any) => {
                const proj = projectById.get(w.project_id) as any;
                return (
                  <li key={w.id} className="rounded-lg border border-border/80 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 font-medium">{w.title}</div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          w._role === "Owner"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-violet-100 text-violet-800"
                        }`}
                      >
                        {w._role}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {proj?.project_code || "Project"} · {w.status} · {w.percent_complete ?? 0}% ·
                      end {w.planned_end || "—"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionFrame>
      </div>

      {/* Keep helper used for clarity */}
      <div className="sr-only">{isAwaitingApproval(null) ? "" : ""}</div>
    </div>
  );
}
