import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { toast } from "sonner";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app/stage-gate-config")({
  component: StageGateConfigPage,
});

const DEFAULTS = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
];

function StageGateConfigPage() {
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ["stage_gate_definitions", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_definitions")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["stage_gate_definitions"] });

  const addGate = async () => {
    const name = newName.trim();
    if (!name || !organization) return;
    const nextOrder = (defs[defs.length - 1]?.sort_order || defs.length) + 1;
    const { error } = await supabase
      .from("stage_gate_definitions")
      .insert({ org_id: organization.id, gate_name: name, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    toast.success(`Added "${name}"`);
    setNewName("");
    invalidate();
  };

  const removeGate = async (id: string) => {
    if (!confirm("Remove this stage gate definition? Existing project gate records are kept.")) return;
    const { error } = await supabase.from("stage_gate_definitions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    invalidate();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("stage_gate_definitions").update({ is_active: !is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= defs.length) return;
    const a = defs[idx];
    const b = defs[next];
    setSaving(true);
    // swap sort_order values (do sequentially with temp to avoid unique-order issues if we ever add uniqueness)
    const { error: e1 } = await supabase.from("stage_gate_definitions").update({ sort_order: b.sort_order }).eq("id", a.id);
    const { error: e2 } = await supabase.from("stage_gate_definitions").update({ sort_order: a.sort_order }).eq("id", b.id);
    setSaving(false);
    if (e1 || e2) return toast.error((e1 || e2)!.message);
    invalidate();
  };

  const renameGate = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("stage_gate_definitions").update({ gate_name: trimmed }).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const resetToDefaults = async () => {
    if (!organization) return;
    if (!confirm("Reset to the 9 default stage gates? This removes your custom list (project gate records are kept).")) return;
    setSaving(true);
    await supabase.from("stage_gate_definitions").delete().eq("org_id", organization.id);
    const rows = DEFAULTS.map((name, i) => ({ org_id: organization.id, gate_name: name, sort_order: i + 1 }));
    const { error } = await supabase.from("stage_gate_definitions").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reset to defaults");
    invalidate();
  };

  return (
    <div>
      <PageHeading icon="🚦">Stage Gate Configuration</PageHeading>
      <div className="mb-4 text-sm text-muted-foreground">
        Define the stage gates used across your organisation. Order controls how they appear on project timelines and infographics.
      </div>

      <SectionFrame>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Organisation Stage Gates</SectionTitle>
          <button onClick={resetToDefaults} disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted">
            <RotateCcw className="h-3 w-3" /> Reset to defaults
          </button>
        </div>

        {isLoading ? (
          <PageLoading label="Loading…" fullScreen={false} />
        ) : defs.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No stage gates defined. Add one below or reset to defaults.</div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {defs.map((g: any, idx: number) => (
              <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="w-8 text-center text-xs font-mono text-muted-foreground">{idx + 1}</span>
                <input
                  defaultValue={g.gate_name}
                  onBlur={(e) => e.target.value !== g.gate_name && renameGate(g.id, e.target.value)}
                  className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-input focus:border-input focus:outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={g.is_active} onChange={() => toggleActive(g.id, g.is_active)} />
                  Active
                </label>
                <button onClick={() => move(idx, -1)} disabled={idx === 0 || saving}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === defs.length - 1 || saving}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeGate(g.id)}
                  className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add a stage gate</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGate()}
              placeholder="e.g. UAT Sign-off"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button onClick={addGate} disabled={!newName.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Save className="h-3.5 w-3.5" /> Changes save automatically.
        </div>
      </SectionFrame>
    </div>
  );
}
