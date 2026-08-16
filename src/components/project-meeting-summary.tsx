import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RagChip, SectionFrame, SectionTitle } from "@/components/streamlit";
import { displayRag } from "@/lib/ops-enhancements";
import { PROJECT_OPS_EXTRAS } from "@/lib/project-selects";
import { Button } from "@/components/ui/button";

type Props = {
  projectId: string;
  project: {
    name?: string | null;
    rag?: string | null;
    rag_override?: string | null;
    rag_override_reason?: string | null;
    rag_override_owner?: string | null;
    sponsor?: string | null;
  };
  /** Compact read-only card for the executive dashboard. */
  readOnly?: boolean;
  /** Allow capturing a new action even when notes are read-only (exec tab). */
  allowAddActions?: boolean;
};

function isOpenAction(status?: string | null) {
  return !/done|closed|cancelled|canceled/i.test(String(status || ""));
}

function isCompleteMilestone(m: { status?: string | null; actual_date?: string | null }) {
  if (m.actual_date) return true;
  return /complete|done|achieved|closed/i.test(String(m.status || ""));
}

/** Soonest incomplete milestone — prefer on/after today, else the overdue one. */
export function pickNextMilestone<
  T extends { planned_date?: string | null; actual_date?: string | null; status?: string | null },
>(milestones: T[]): T | null {
  const open = milestones.filter((m) => !isCompleteMilestone(m));
  if (open.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const byPlanned = (a: T, b: T) =>
    String(a.planned_date || "9999-12-31").localeCompare(String(b.planned_date || "9999-12-31"));
  const upcoming = open.filter((m) => (m.planned_date || "") >= today).sort(byPlanned);
  if (upcoming[0]) return upcoming[0];
  return [...open].sort(byPlanned)[0] ?? null;
}

export function ProjectMeetingSummary({ projectId, project, readOnly, allowAddActions }: Props) {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: extras } = useQuery({
    queryKey: ["project", projectId, "ops-extras"],
    queryFn: async () => {
      const wide = await supabase
        .from("projects")
        .select(`id,rag,${PROJECT_OPS_EXTRAS}` as "*")
        .eq("id", projectId)
        .maybeSingle();
      if (!wide.error) return wide.data as any;
      return null;
    },
    enabled: !!projectId,
  });

  const { data: summary } = useQuery({
    queryKey: ["project_meeting_summaries", orgId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_meeting_summaries" as any)
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
    enabled: !!orgId && !!projectId,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["actions", orgId, projectId, "summary"],
    queryFn: async () =>
      (
        await supabase
          .from("actions")
          .select("id,title,status,due_date,completed_date,owner")
          .eq("project_id", projectId)
      ).data ?? [],
    enabled: !!orgId && !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", orgId, projectId, "summary"],
    queryFn: async () =>
      (
        await supabase
          .from("milestones")
          .select("id,name,status,planned_date,actual_date")
          .eq("project_id", projectId)
      ).data ?? [],
    enabled: !!orgId && !!projectId,
  });

  const prev = summary?.previous_meeting_date || "";
  const next = summary?.next_meeting_date || "";

  const systemDone = useMemo(() => {
    const since = prev || "1970-01-01";
    const doneActions = (actions as any[]).filter((a) => {
      const done = String(a.status || "").toLowerCase() === "done" || a.completed_date;
      const when = (a.completed_date || "").slice(0, 10);
      return done && when >= since;
    });
    const hitMs = (milestones as any[]).filter((m) => {
      const actual = (m.actual_date || "").slice(0, 10);
      const complete = /complete|done|achieved/i.test(String(m.status || ""));
      return actual && actual >= since && (complete || actual);
    });
    return { doneActions, hitMs };
  }, [actions, milestones, prev]);

  const systemNext = useMemo(() => {
    const until = next || "9999-12-31";
    const openActions = (actions as any[]).filter((a) => {
      const due = (a.due_date || "").slice(0, 10);
      return isOpenAction(a.status) && (!due || due <= until);
    });
    const nextMilestone = pickNextMilestone(milestones as any[]);
    return { openActions, nextMilestone };
  }, [actions, milestones, next]);

  const [newAction, setNewAction] = useState({ title: "", owner: "", due_date: "" });
  const canAddActions = !readOnly || allowAddActions;

  const addAction = useMutation({
    mutationFn: async () => {
      const title = newAction.title.trim();
      if (!orgId || !projectId || !title) throw new Error("Action title is required");
      const { error } = await supabase.from("actions").insert({
        org_id: orgId,
        project_id: projectId,
        title,
        owner: newAction.owner.trim() || null,
        due_date: newAction.due_date || null,
        status: "Open",
        priority: "Medium",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Action added");
      setNewAction({ title: "", owner: "", due_date: "" });
      qc.invalidateQueries({ queryKey: ["actions", orgId, projectId, "summary"] });
      qc.invalidateQueries({ queryKey: ["actions", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const ragSource = extras || project;
  const merged = {
    previous_meeting_date: form.previous_meeting_date ?? prev,
    next_meeting_date: form.next_meeting_date ?? next,
    progress_manual: form.progress_manual ?? summary?.progress_manual ?? "",
    action_plan_manual: form.action_plan_manual ?? summary?.action_plan_manual ?? "",
    rag_override: form.rag_override ?? ragSource.rag_override ?? "",
    rag_override_reason: form.rag_override_reason ?? ragSource.rag_override_reason ?? "",
    rag_override_owner: form.rag_override_owner ?? ragSource.rag_override_owner ?? "",
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        org_id: orgId,
        project_id: projectId,
        previous_meeting_date: merged.previous_meeting_date || null,
        next_meeting_date: merged.next_meeting_date || null,
        progress_manual: merged.progress_manual || null,
        action_plan_manual: merged.action_plan_manual || null,
        updated_by: session?.user?.id || null,
      };
      const { error } = await supabase
        .from("project_meeting_summaries" as any)
        .upsert(payload, { onConflict: "org_id,project_id" });
      if (error) throw error;
      const { error: pe } = await supabase
        .from("projects")
        .update({
          rag_override: merged.rag_override || null,
          rag_override_reason: merged.rag_override_reason || null,
          rag_override_owner: merged.rag_override_owner || null,
        } as never)
        .eq("id", projectId);
      if (pe) throw pe;
    },
    onSuccess: () => {
      toast.success("Project summary saved");
      qc.invalidateQueries({ queryKey: ["project_meeting_summaries"] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", projectId, "ops-extras"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rag = displayRag({ rag: ragSource.rag ?? project.rag, rag_override: merged.rag_override });

  return (
    <SectionFrame>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>
          {readOnly ? project.name || "Project summary" : "Meeting summary"}
        </SectionTitle>
        <RagChip rag={rag} label={merged.rag_override ? `${rag} (override)` : rag || undefined} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Since previous meeting
          </h4>
          <ul className="mb-2 list-disc pl-4 text-sm">
            {systemDone.doneActions.map((a: any) => (
              <li key={a.id}>Action done: {a.title}</li>
            ))}
            {systemDone.hitMs.map((m: any) => (
              <li key={m.id}>Milestone: {m.name}</li>
            ))}
            {systemDone.doneActions.length === 0 && systemDone.hitMs.length === 0 && (
              <li className="text-muted-foreground">
                No system-generated completions in this window.
              </li>
            )}
          </ul>
          {readOnly ? (
            <p className="whitespace-pre-wrap text-sm">{merged.progress_manual || "—"}</p>
          ) : (
            <textarea
              className="st-input min-h-[88px]"
              placeholder="Manual progress / updates…"
              value={merged.progress_manual}
              onChange={(e) => setForm((f) => ({ ...f, progress_manual: e.target.value }))}
            />
          )}
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Action plan until next meeting
          </h4>
          <ul className="mb-2 list-disc pl-4 text-sm">
            {systemNext.openActions.map((a: any) => (
              <li key={a.id}>
                Open action: {a.title}
                {a.due_date ? ` · due ${a.due_date}` : ""}
              </li>
            ))}
            {systemNext.nextMilestone ? (
              <li>
                Next milestone: {systemNext.nextMilestone.name}
                {systemNext.nextMilestone.planned_date
                  ? ` · ${systemNext.nextMilestone.planned_date}`
                  : ""}
              </li>
            ) : null}
            {systemNext.openActions.length === 0 && !systemNext.nextMilestone && (
              <li className="text-muted-foreground">
                No open actions or next milestone in this window.
              </li>
            )}
          </ul>
          {readOnly ? (
            <p className="whitespace-pre-wrap text-sm">{merged.action_plan_manual || "—"}</p>
          ) : (
            <textarea
              className="st-input min-h-[88px]"
              placeholder="Manual action plan…"
              value={merged.action_plan_manual}
              onChange={(e) => setForm((f) => ({ ...f, action_plan_manual: e.target.value }))}
            />
          )}
        </div>
      </div>
      {canAddActions && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Add action
          </h4>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="text-xs md:col-span-2">
              Title
              <input
                className="st-input mt-1"
                value={newAction.title}
                onChange={(e) => setNewAction((f) => ({ ...f, title: e.target.value }))}
                placeholder="What needs to happen"
              />
            </label>
            <label className="text-xs">
              Owner
              <input
                className="st-input mt-1"
                value={newAction.owner}
                onChange={(e) => setNewAction((f) => ({ ...f, owner: e.target.value }))}
                placeholder="Owner"
              />
            </label>
            <label className="text-xs">
              Due
              <input
                type="date"
                className="st-input mt-1"
                value={newAction.due_date}
                onChange={(e) => setNewAction((f) => ({ ...f, due_date: e.target.value }))}
              />
            </label>
          </div>
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => addAction.mutate()}
              disabled={addAction.isPending || !newAction.title.trim()}
            >
              {addAction.isPending ? "Adding…" : "Add action"}
            </Button>
          </div>
        </div>
      )}
      {!readOnly && (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-xs">
            Previous meeting
            <input
              type="date"
              className="st-input mt-1"
              value={merged.previous_meeting_date}
              onChange={(e) => setForm((f) => ({ ...f, previous_meeting_date: e.target.value }))}
            />
          </label>
          <label className="text-xs">
            Next meeting
            <input
              type="date"
              className="st-input mt-1"
              value={merged.next_meeting_date}
              onChange={(e) => setForm((f) => ({ ...f, next_meeting_date: e.target.value }))}
            />
          </label>
          <label className="text-xs">
            RAG override
            <select
              className="st-input mt-1"
              value={merged.rag_override}
              onChange={(e) => setForm((f) => ({ ...f, rag_override: e.target.value }))}
            >
              <option value="">Use register RAG</option>
              <option value="Green">Green</option>
              <option value="Amber">Amber</option>
              <option value="Red">Red</option>
            </select>
          </label>
          <label className="text-xs">
            Override owner
            <input
              className="st-input mt-1"
              value={merged.rag_override_owner}
              onChange={(e) => setForm((f) => ({ ...f, rag_override_owner: e.target.value }))}
              placeholder="Who owns this colour"
            />
          </label>
          <label className="text-xs md:col-span-3">
            Override explanation
            <input
              className="st-input mt-1"
              value={merged.rag_override_reason}
              onChange={(e) => setForm((f) => ({ ...f, rag_override_reason: e.target.value }))}
              placeholder="Why the register RAG is overridden"
            />
          </label>
          <div className="flex items-end">
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              Save summary
            </Button>
          </div>
        </div>
      )}
      {readOnly && merged.rag_override && (
        <p className="mt-2 text-xs text-muted-foreground">
          Override by {merged.rag_override_owner || "—"}: {merged.rag_override_reason || "—"}
        </p>
      )}
    </SectionFrame>
  );
}
