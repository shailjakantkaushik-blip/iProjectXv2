import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ArrowRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  canActOnDecision,
  isAwaitingApproval,
  type DecisionOutcome,
} from "@/lib/decision-approval";

export const Route = createFileRoute("/_authenticated/app/my-work")({
  component: MyWorkPage,
});

function MyWorkPage() {
  const { organization, session, profile } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", orgId],
    queryFn: async () =>
      (await supabase.from("decisions").select("*").order("decision_date", { ascending: false }))
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
      (await supabase.from("actions").select("*").order("due_date")).data ?? [],
    enabled: !!orgId,
  });

  const { data: workItems = [] } = useQuery({
    queryKey: ["work_items", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_items" as any).select("*");
      if (error) return [];
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () =>
      (
        await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId!)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(10)
      ).data ?? [],
    enabled: !!userId,
  });

  const projectById = new Map(projects.map((p: any) => [p.id, p]));

  const awaitingDecisions = decisions.filter((d: any) => canActOnDecision(d, userId));
  const myActions = actions.filter(
    (a: any) =>
      a.status !== "Closed" &&
      (a.owner === profile?.full_name ||
        a.owner === profile?.email ||
        (a.owner && profile?.full_name && String(a.owner).includes(profile.full_name.split(" ")[0]))),
  );
  const myWork = workItems.filter(
    (w: any) => w.owner_user_id === userId && w.status !== "Done" && w.status !== "Cancelled",
  );
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
        subtitle="Approvals, actions, and delivery items that need you"
      />

      <SectionFrame>
        <SectionTitle>Command queue</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Approvals waiting" value={awaitingDecisions.length} />
          <KpiCard label="My open actions" value={myActions.length} />
          <KpiCard label="My work items" value={myWork.length} />
          <KpiCard label="Unread alerts" value={notifications.length} />
        </div>
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
                          {proj?.project_code || "Project"} · {d.outcome || "Pending"}
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
            <Link to="/app/work-items" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open board <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {myWork.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active work items assigned to you
            </div>
          ) : (
            <ul className="space-y-2">
              {myWork.slice(0, 8).map((w: any) => (
                <li key={w.id} className="rounded-lg border border-border/80 px-3 py-2 text-sm">
                  <div className="font-medium">{w.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {w.status} · {w.percent_complete ?? 0}% · end {w.planned_end || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionFrame>
      </div>

      {/* Keep helper used for clarity */}
      <div className="sr-only">{isAwaitingApproval(null) ? "" : ""}</div>
    </div>
  );
}
