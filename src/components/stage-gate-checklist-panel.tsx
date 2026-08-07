import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EntityComments } from "@/components/entity-comments";
import {
  approvalBlockedReason,
  summarizeGateChecklist,
  type GateChecklistSummary,
} from "@/lib/stage-gate-checklist";
import { persistCurrentPhaseFromGates } from "@/lib/project-phase";

type ChecklistItem = {
  id: string;
  gate_name: string;
  title: string;
  description: string | null;
  required: boolean;
  sort_order: number;
};

type ChecklistResponse = {
  id: string;
  stage_gate_id: string;
  checklist_item_id: string;
  completed: boolean;
  evidence_url: string | null;
  evidence_notes: string | null;
};

export function GateChecklistBadge({ summary }: { summary: GateChecklistSummary }) {
  if (summary.total === 0) {
    return (
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
        No checklist
      </span>
    );
  }
  if (summary.requiredOpen > 0) {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
        {summary.pct}% · {summary.requiredOpen} req open
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
      {summary.pct}% · ready
    </span>
  );
}

/** Checklist + evidence for one stage gate instance. */
export function StageGateChecklistPanel({
  stageGateId,
  gateName,
  projectId,
  currentStatus,
}: {
  stageGateId: string;
  gateName: string;
  projectId?: string | null;
  currentStatus?: string | null;
}) {
  const { organization, session } = useAuth();
  const orgId = organization?.id;
  const userId = session?.user?.id;
  const qc = useQueryClient();
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});

  const itemsQ = useQuery({
    queryKey: ["stage_gate_checklist_items", orgId, gateName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .select("id,gate_name,title,description,required,sort_order")
        .eq("org_id", orgId!)
        .eq("gate_name", gateName)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as ChecklistItem[];
    },
    enabled: !!orgId && !!gateName,
  });

  const respQ = useQuery({
    queryKey: ["stage_gate_checklist_responses", orgId, stageGateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_checklist_responses" as any)
        .select("id,stage_gate_id,checklist_item_id,completed,evidence_url,evidence_notes")
        .eq("stage_gate_id", stageGateId);
      if (error) throw error;
      return (data ?? []) as unknown as ChecklistResponse[];
    },
    enabled: !!orgId && !!stageGateId,
  });

  const respByItem = useMemo(() => {
    const m = new Map<string, ChecklistResponse>();
    for (const r of respQ.data ?? []) m.set(r.checklist_item_id, r);
    return m;
  }, [respQ.data]);

  const items = itemsQ.data ?? [];
  const summary = useMemo(
    () =>
      summarizeGateChecklist(
        items,
        (respQ.data ?? []).map((r) => ({
          checklist_item_id: r.checklist_item_id,
          completed: r.completed,
        })),
      ),
    [items, respQ.data],
  );
  const done = summary.done;
  const requiredMissing = summary.requiredOpen;
  const blockReason = approvalBlockedReason(summary);
  const alreadyApproved = /approved/i.test(String(currentStatus || ""));

  const upsert = useMutation({
    mutationFn: async (opts: {
      itemId: string;
      completed: boolean;
      evidence_url?: string;
      evidence_notes?: string;
    }) => {
      if (!orgId) throw new Error("No org");
      const existing = respByItem.get(opts.itemId);
      const payload = {
        org_id: orgId,
        stage_gate_id: stageGateId,
        checklist_item_id: opts.itemId,
        completed: opts.completed,
        evidence_url: opts.evidence_url ?? existing?.evidence_url ?? null,
        evidence_notes: opts.evidence_notes ?? existing?.evidence_notes ?? null,
        completed_by: opts.completed ? userId || null : null,
        completed_at: opts.completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        const { error } = await supabase
          .from("stage_gate_checklist_responses" as any)
          .update(payload as never)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("stage_gate_checklist_responses" as any)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["stage_gate_checklist_responses", orgId, stageGateId],
      });
    },
    onError: (e: Error) => {
      if (/checklist|schema cache|does not exist/i.test(e.message)) {
        toast.error("Run ppm_platform_depth.sql / checklist governance SQL in Supabase, then Reload schema");
      } else toast.error(e.message);
    },
  });

  const approveGate = useMutation({
    mutationFn: async () => {
      if (blockReason) throw new Error(blockReason);
      const { error } = await supabase
        .from("stage_gates")
        .update({
          status: "Approved",
          actual_date: new Date().toISOString().slice(0, 10),
        } as never)
        .eq("id", stageGateId);
      if (error) throw error;
      if (projectId) {
        await persistCurrentPhaseFromGates(supabase as any, projectId);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stage_gates"] });
      toast.success("Gate approved — checklist complete");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (itemsQ.isError || respQ.isError) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Gate checklists need the checklist SQL applied (Reload schema after).
      </p>
    );
  }

  if (!items.length && !itemsQ.isLoading) {
    return (
      <p className="text-xs text-muted-foreground">
        No checklist template for gate “{gateName}”. Admins can add items under{" "}
        <Link to="/app/stage-gate-config" className="font-medium text-primary hover:underline">
          Stage Gate Configuration
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold">
          {done}/{items.length} complete
        </span>
        <GateChecklistBadge summary={summary} />
        {requiredMissing > 0 ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
            {requiredMissing} required open
          </span>
        ) : (
          <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
            Required items done
          </span>
        )}
        {!alreadyApproved ? (
          <button
            type="button"
            disabled={!!blockReason || approveGate.isPending}
            title={blockReason || "Approve this gate"}
            onClick={() => approveGate.mutate()}
            className="ml-auto rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approveGate.isPending ? "Approving…" : "Approve gate"}
          </button>
        ) : (
          <span className="ml-auto text-[11px] font-semibold text-emerald-700">Approved</span>
        )}
      </div>
      {blockReason && !alreadyApproved ? (
        <p className="text-[11px] text-amber-800">{blockReason}</p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => {
          const resp = respByItem.get(item.id);
          const completed = !!resp?.completed;
          return (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={completed}
                  onChange={(e) =>
                    upsert.mutate({
                      itemId: item.id,
                      completed: e.target.checked,
                      evidence_url: urlDraft[item.id] ?? resp?.evidence_url ?? undefined,
                      evidence_notes: notesDraft[item.id] ?? resp?.evidence_notes ?? undefined,
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {item.title}
                    {item.required ? (
                      <span className="ml-1 text-[10px] text-rose-600">required</span>
                    ) : null}
                  </span>
                  {item.description ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <input
                  className="st-input !h-8 !text-xs"
                  placeholder="Evidence URL (SharePoint / Drive…)"
                  defaultValue={resp?.evidence_url || ""}
                  onChange={(e) =>
                    setUrlDraft((d) => ({ ...d, [item.id]: e.target.value }))
                  }
                  onBlur={() =>
                    upsert.mutate({
                      itemId: item.id,
                      completed,
                      evidence_url: urlDraft[item.id] ?? resp?.evidence_url ?? "",
                      evidence_notes: notesDraft[item.id] ?? resp?.evidence_notes ?? undefined,
                    })
                  }
                />
                <input
                  className="st-input !h-8 !text-xs"
                  placeholder="Evidence notes"
                  defaultValue={resp?.evidence_notes || ""}
                  onChange={(e) =>
                    setNotesDraft((d) => ({ ...d, [item.id]: e.target.value }))
                  }
                  onBlur={() =>
                    upsert.mutate({
                      itemId: item.id,
                      completed,
                      evidence_url: urlDraft[item.id] ?? resp?.evidence_url ?? undefined,
                      evidence_notes: notesDraft[item.id] ?? resp?.evidence_notes ?? "",
                    })
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      <EntityComments entityType="stage_gate" entityId={stageGateId} />
    </div>
  );
}
