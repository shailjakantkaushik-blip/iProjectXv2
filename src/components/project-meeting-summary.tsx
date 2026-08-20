import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RagChip, SectionFrame, SectionTitle } from "@/components/streamlit";
import { displayRag, isRagOverridden } from "@/lib/ops-enhancements";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
};

export function ProjectMeetingSummary({ projectId, project, readOnly }: Props) {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const { data: extras } = useQuery({
    queryKey: ["project", projectId, "ops-extras"],
    queryFn: async () => {
      const wide = await supabase
        .from("projects")
        .select("id,rag,rag_override,rag_override_reason,rag_override_owner" as "*")
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
          .select("id,title,status,due_date,completed_date")
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
      const open = !/done|closed|cancelled/i.test(String(a.status || ""));
      const due = (a.due_date || "").slice(0, 10);
      return open && (!due || due <= until);
    });
    const upcoming = (milestones as any[])
      .filter((m) => {
        const planned = (m.planned_date || "").slice(0, 10);
        if (m.actual_date || !planned || planned > until) return false;
        if (/complete|done|achieved/i.test(String(m.status || ""))) return false;
        return true;
      })
      .sort((a, b) =>
        String(a.planned_date).slice(0, 10).localeCompare(String(b.planned_date).slice(0, 10)),
      )
      .slice(0, 1);
    return { openActions, upcoming };
  }, [actions, milestones, next]);

  const [form, setForm] = useState<Record<string, string>>({});
  const [hideAutoDraft, setHideAutoDraft] = useState<boolean | null>(null);
  const ragSource = extras || project;
  const hideAutomaticNotes =
    hideAutoDraft ?? (summary?.hide_automatic_notes === true);
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
      const payload: Record<string, unknown> = {
        org_id: orgId,
        project_id: projectId,
        previous_meeting_date: merged.previous_meeting_date || null,
        next_meeting_date: merged.next_meeting_date || null,
        progress_manual: merged.progress_manual || null,
        action_plan_manual: merged.action_plan_manual || null,
        hide_automatic_notes: hideAutomaticNotes,
        updated_by: session?.user?.id || null,
      };
      let { error } = await supabase
        .from("project_meeting_summaries" as any)
        .upsert(payload, { onConflict: "org_id,project_id" });
      if (error && /hide_automatic_notes/i.test(error.message)) {
        delete payload.hide_automatic_notes;
        ({ error } = await supabase
          .from("project_meeting_summaries" as any)
          .upsert(payload, { onConflict: "org_id,project_id" }));
      }
      if (error) throw error;
      const { error: pe } = await supabase
        .from("projects")
        .update({
          rag_override: merged.rag_override || null,
          rag_override_reason: merged.rag_override_reason || null,
          rag_override_owner: merged.rag_override_owner || null,
        } as never)
        .eq("id", projectId);
      if (pe && !/column|schema cache|rag_override/i.test(pe.message)) throw pe;
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
    <SectionFrame exportable={!readOnly}>
      {!readOnly && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Project Summary</SectionTitle>
          <RagChip rag={rag} manual={isRagOverridden({ rag_override: merged.rag_override })} />
        </div>
      )}
      {!readOnly && (
        <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={hideAutomaticNotes}
            onCheckedChange={(v) => setHideAutoDraft(v === true)}
          />
          <span>
            <span className="font-medium">Hide automatic notes</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              System-generated actions and milestones stay off this summary and Executive Cockpit.
              Manual notes remain. Save summary to apply.
            </span>
          </span>
        </label>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Since previous meeting
          </h4>
          {!hideAutomaticNotes ? (
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
          ) : null}
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
          {!hideAutomaticNotes ? (
          <ul className="mb-2 list-disc pl-4 text-sm">
            {systemNext.openActions.map((a: any) => (
              <li key={a.id}>
                Open action: {a.title}
                {a.due_date ? ` · due ${a.due_date}` : ""}
              </li>
            ))}
            {systemNext.upcoming.map((m: any) => (
              <li key={m.id}>
                Next milestone: {m.name}
                {m.planned_date ? ` · due ${String(m.planned_date).slice(0, 10)}` : ""}
              </li>
            ))}
            {systemNext.openActions.length === 0 && systemNext.upcoming.length === 0 && (
              <li className="text-muted-foreground">
                No open actions or next due milestone in this window.
              </li>
            )}
          </ul>
          ) : null}
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
