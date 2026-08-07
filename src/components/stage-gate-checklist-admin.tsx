/**
 * Admin editor for org checklist templates on Stage Gate Config.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { DEFAULT_GATE_CHECKLISTS } from "@/lib/stage-gate-checklist";

type Item = {
  id: string;
  gate_name: string;
  title: string;
  description: string | null;
  required: boolean;
  sort_order: number;
};

export function StageGateChecklistAdmin({
  gateNames,
}: {
  /** Active definition names in org order. */
  gateNames: string[];
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [selected, setSelected] = useState(gateNames[0] || "");
  const [newTitle, setNewTitle] = useState("");

  const activeGate = selected || gateNames[0] || "";

  const itemsQ = useQuery({
    queryKey: ["stage_gate_checklist_items", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .select("id,gate_name,title,description,required,sort_order")
        .eq("org_id", orgId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
    enabled: !!orgId,
  });

  const itemsForGate = useMemo(
    () => (itemsQ.data ?? []).filter((i) => i.gate_name === activeGate),
    [itemsQ.data, activeGate],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["stage_gate_checklist_items"] });
  };

  const addItem = useMutation({
    mutationFn: async () => {
      if (!orgId || !activeGate || !newTitle.trim()) throw new Error("Title required");
      const nextOrder =
        (itemsForGate[itemsForGate.length - 1]?.sort_order || itemsForGate.length * 10) + 10;
      const { error } = await supabase.from("stage_gate_checklist_items" as any).insert({
        org_id: orgId,
        gate_name: activeGate,
        title: newTitle.trim(),
        required: true,
        sort_order: nextOrder,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTitle("");
      invalidate();
      toast.success("Checklist item added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async (patch: { id: string; title?: string; required?: boolean }) => {
      const { error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .update({
          ...(patch.title != null ? { title: patch.title } : {}),
          ...(patch.required != null ? { required: patch.required } : {}),
        } as never)
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const rows: {
        org_id: string;
        gate_name: string;
        title: string;
        required: boolean;
        sort_order: number;
      }[] = [];
      for (const name of gateNames) {
        const pack = DEFAULT_GATE_CHECKLISTS[name];
        if (!pack) continue;
        const existing = new Set(
          (itemsQ.data ?? []).filter((i) => i.gate_name === name).map((i) => i.title),
        );
        for (const item of pack) {
          if (existing.has(item.title)) continue;
          rows.push({
            org_id: orgId,
            gate_name: name,
            title: item.title,
            required: item.required,
            sort_order: item.sort_order,
          });
        }
      }
      // Minimal pack for custom gate names with no template
      for (const name of gateNames) {
        const hasAny = (itemsQ.data ?? []).some((i) => i.gate_name === name) ||
          rows.some((r) => r.gate_name === name);
        if (hasAny) continue;
        rows.push(
          {
            org_id: orgId,
            gate_name: name,
            title: "Entry criteria met / prior gate closed",
            required: true,
            sort_order: 10,
          },
          {
            org_id: orgId,
            gate_name: name,
            title: "Stage review pack attached",
            required: true,
            sort_order: 20,
          },
          {
            org_id: orgId,
            gate_name: name,
            title: "Risks, issues & decisions reviewed",
            required: true,
            sort_order: 30,
          },
          {
            org_id: orgId,
            gate_name: name,
            title: "Sponsor / forum endorsement recorded",
            required: true,
            sort_order: 40,
          },
        );
      }
      if (!rows.length) return 0;
      const { error } = await supabase
        .from("stage_gate_checklist_items" as any)
        .insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(n ? `Seeded ${n} checklist items` : "Templates already up to date");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!gateNames.length) {
    return (
      <SectionFrame>
        <SectionTitle>Gate checklist templates</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Add stage gate definitions first, then define checklist items for each gate.
        </p>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Gate checklist templates</SectionTitle>
        <button
          type="button"
          onClick={() => seedDefaults.mutate()}
          disabled={seedDefaults.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
        >
          <Sparkles className="h-3 w-3" /> Seed defaults for all gates
        </button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Required items must be completed (with evidence) before a project/stream gate can be
        Approved. Templates are organisation-wide and applied by gate name.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {gateNames.map((n) => {
          const count = (itemsQ.data ?? []).filter((i) => i.gate_name === n).length;
          const active = n === activeGate;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setSelected(n)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {n}
              <span className="ml-1 tabular-nums opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-sm font-semibold">{activeGate}</div>
      {itemsForGate.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No checklist items for this gate yet. Seed defaults or add items below.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-border rounded-md border border-border">
          {itemsForGate.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <input
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-input focus:border-input focus:outline-none"
                defaultValue={item.title}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== item.title) updateItem.mutate({ id: item.id, title: t });
                }}
              />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={() =>
                    updateItem.mutate({ id: item.id, required: !item.required })
                  }
                />
                Required
              </label>
              <button
                type="button"
                className="rounded p-1 text-rose-600 hover:bg-rose-50"
                onClick={() =>
                  confirm("Remove this checklist item?") && deleteItem.mutate(item.id)
                }
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[16rem] flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add checklist item for {activeGate}
          </span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem.mutate()}
            placeholder="e.g. Architecture review signed"
          />
        </label>
        <button
          type="button"
          disabled={!newTitle.trim() || addItem.isPending}
          onClick={() => addItem.mutate()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </SectionFrame>
  );
}
