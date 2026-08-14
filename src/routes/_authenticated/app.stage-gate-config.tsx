import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  GripVertical,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { toast } from "sonner";
import { PageLoading } from "@/components/page-loading";
import { StageGateChecklistAdmin } from "@/components/stage-gate-checklist-admin";
import {
  AGILE_GATE_DEFAULTS,
  WATERFALL_GATE_DEFAULTS,
  deliveryMethodsQueryKey,
  ensureOrgDeliveryMethods,
  fetchDeliveryMethods,
  slugifyDeliveryCode,
  type DeliveryMethodRow,
  defaultGatesForMethodCode,
} from "@/lib/delivery-methods";

export const Route = createFileRoute("/_authenticated/app/stage-gate-config")({
  component: StageGateConfigPage,
});

function StageGateConfigPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [newGateName, setNewGateName] = useState("");
  const [newMethodName, setNewMethodName] = useState("");
  const [newUsesGates, setNewUsesGates] = useState(true);
  const [newUsesSprints, setNewUsesSprints] = useState(false);
  const [saving, setSaving] = useState(false);

  const methodsQ = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: async () => {
      await ensureOrgDeliveryMethods(orgId!);
      return fetchDeliveryMethods(orgId!, { activeOnly: false });
    },
    enabled: !!orgId,
  });

  const methods = methodsQ.data ?? [];
  const activeMethodId = selectedMethodId || methods[0]?.id || "";
  const activeMethod = useMemo(
    () => methods.find((m) => m.id === activeMethodId) ?? methods[0],
    [methods, activeMethodId],
  );

  useEffect(() => {
    if (!selectedMethodId && methods[0]?.id) setSelectedMethodId(methods[0].id);
  }, [methods, selectedMethodId]);

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ["stage_gate_definitions", orgId, activeMethodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_definitions")
        .select("*")
        .eq("org_id", orgId!)
        .eq("delivery_method_id", activeMethodId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && !!activeMethodId,
  });

  const invalidateGates = () =>
    qc.invalidateQueries({ queryKey: ["stage_gate_definitions"] });
  const invalidateMethods = () =>
    qc.invalidateQueries({ queryKey: deliveryMethodsQueryKey(orgId) });

  const addGate = async () => {
    const name = newGateName.trim();
    if (!name || !organization || !activeMethod) return;
    const nextOrder = (defs[defs.length - 1]?.sort_order || defs.length) + 1;
    const { error } = await supabase.from("stage_gate_definitions").insert({
      org_id: organization.id,
      delivery_method_id: activeMethod.id,
      gate_name: name,
      sort_order: nextOrder,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(`Added "${name}"`);
    setNewGateName("");
    invalidateGates();
  };

  const removeGate = async (id: string) => {
    if (!confirm("Remove this stage gate definition? Existing project gate records are kept."))
      return;
    const { error } = await supabase.from("stage_gate_definitions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    invalidateGates();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    const { error } = await supabase
      .from("stage_gate_definitions")
      .update({ is_active: !is_active })
      .eq("id", id);
    if (error) return toast.error(error.message);
    invalidateGates();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= defs.length) return;
    const a = defs[idx];
    const b = defs[next];
    setSaving(true);
    const { error: e1 } = await supabase
      .from("stage_gate_definitions")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    const { error: e2 } = await supabase
      .from("stage_gate_definitions")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    setSaving(false);
    if (e1 || e2) return toast.error((e1 || e2)!.message);
    invalidateGates();
  };

  const renameGate = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = defs.find((d: any) => d.id === id)?.gate_name as string | undefined;
    const { error } = await supabase
      .from("stage_gate_definitions")
      .update({ gate_name: trimmed })
      .eq("id", id);
    if (error) return toast.error(error.message);
    if (organization && prev && prev !== trimmed) {
      await supabase
        .from("stage_gate_checklist_items" as any)
        .update({ gate_name: trimmed } as never)
        .eq("org_id", organization.id)
        .eq("gate_name", prev);
      void qc.invalidateQueries({ queryKey: ["stage_gate_checklist_items"] });
    }
    invalidateGates();
  };

  const resetToDefaults = async () => {
    if (!organization || !activeMethod) return;
    if (
      !confirm(
        `Reset "${activeMethod.name}" stage gates to defaults? Custom gates for this method are removed (project gate records are kept).`,
      )
    )
      return;
    setSaving(true);
    await supabase
      .from("stage_gate_definitions")
      .delete()
      .eq("org_id", organization.id)
      .eq("delivery_method_id", activeMethod.id);
    const names = defaultGatesForMethodCode(activeMethod.code);
    const rows = names.map((name, i) => ({
      org_id: organization.id,
      delivery_method_id: activeMethod.id,
      gate_name: name,
      sort_order: i + 1,
    }));
    const { error } = await supabase.from("stage_gate_definitions").insert(rows as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reset to defaults");
    invalidateGates();
  };

  const addCustomMethod = async () => {
    const name = newMethodName.trim();
    if (!name || !organization) return;
    const code = slugifyDeliveryCode(name);
    const nextOrder = (methods[methods.length - 1]?.sort_order || methods.length) + 1;
    const { data, error } = await supabase
      .from("delivery_methods")
      .insert({
        org_id: organization.id,
        code,
        name,
        description: "Custom delivery method",
        uses_stage_gates: newUsesGates,
        uses_sprints: newUsesSprints,
        is_system: false,
        is_active: true,
        sort_order: nextOrder,
      })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    const row = data as DeliveryMethodRow;
    // Seed starter gates when method uses them
    if (newUsesGates) {
      const seed = newUsesSprints ? WATERFALL_GATE_DEFAULTS : WATERFALL_GATE_DEFAULTS;
      const from =
        name.toLowerCase().includes("agile") ? AGILE_GATE_DEFAULTS : seed;
      await supabase.from("stage_gate_definitions").insert(
        from.map((gate_name, i) => ({
          org_id: organization.id,
          delivery_method_id: row.id,
          gate_name,
          sort_order: i + 1,
        })) as any,
      );
    }
    toast.success(`Created "${name}"`);
    setNewMethodName("");
    setNewUsesGates(true);
    setNewUsesSprints(false);
    invalidateMethods();
    invalidateGates();
    setSelectedMethodId(row.id);
  };

  const updateMethodFlags = async (
    method: DeliveryMethodRow,
    patch: Partial<Pick<DeliveryMethodRow, "uses_stage_gates" | "uses_sprints" | "is_active" | "name" | "description">>,
  ) => {
    const { error } = await supabase
      .from("delivery_methods")
      .update(patch)
      .eq("id", method.id);
    if (error) return toast.error(error.message);
    invalidateMethods();
  };

  const removeMethod = async (method: DeliveryMethodRow) => {
    if (method.is_system) return toast.error("Built-in methods cannot be deleted.");
    if (
      !confirm(
        `Delete delivery method "${method.name}"? Its stage-gate templates will be removed. Projects keep their delivery method name.`,
      )
    )
      return;
    const { error } = await supabase
      .from("delivery_methods")
      .delete()
      .eq("id", method.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    if (selectedMethodId === method.id) setSelectedMethodId("");
    invalidateMethods();
    invalidateGates();
  };

  return (
    <div>
      <PageHeading icon="🚦">Stage Gate & Delivery Methods</PageHeading>
      <div className="mb-4 text-sm text-muted-foreground">
        Configure delivery methods for your organisation (Waterfall, Agile, Hybrid, or custom),
        then define the stage-gate template for each method that uses gates.{" "}
        <Link to="/app/stage-gates" className="font-medium text-primary hover:underline">
          Open Stage Gates register →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <SectionFrame>
          <SectionTitle>Delivery methods</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            Org admins can add custom methods and choose whether each uses stage gates and/or
            sprints.
          </p>
          {methodsQ.isLoading ? (
            <PageLoading label="Loading…" fullScreen={false} />
          ) : (
            <div className="space-y-1">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethodId(m.id)}
                  className={
                    "flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition " +
                    (m.id === activeMethod?.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50") +
                    (m.is_active ? "" : " opacity-60")
                  }
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {m.uses_stage_gates ? "Gates" : "No gates"}
                    {" · "}
                    {m.uses_sprints ? "Sprints" : "No sprints"}
                    {m.is_system ? " · Built-in" : " · Custom"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add custom method
            </div>
            <input
              value={newMethodName}
              onChange={(e) => setNewMethodName(e.target.value)}
              placeholder="e.g. SAFe, Prince2"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={newUsesGates}
                onChange={(e) => setNewUsesGates(e.target.checked)}
              />
              Uses stage gates
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={newUsesSprints}
                onChange={(e) => setNewUsesSprints(e.target.checked)}
              />
              Uses sprints
            </label>
            <button
              type="button"
              onClick={addCustomMethod}
              disabled={!newMethodName.trim()}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add method
            </button>
          </div>
        </SectionFrame>

        <div className="space-y-4">
          {activeMethod && (
            <SectionFrame>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <SectionTitle>{activeMethod.name}</SectionTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeMethod.description ||
                      (activeMethod.is_system
                        ? "Built-in delivery method"
                        : "Custom delivery method")}
                  </p>
                </div>
                {!activeMethod.is_system && (
                  <button
                    type="button"
                    onClick={() => removeMethod(activeMethod)}
                    className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete method
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeMethod.uses_stage_gates}
                    onChange={(e) =>
                      updateMethodFlags(activeMethod, { uses_stage_gates: e.target.checked })
                    }
                  />
                  Uses stage gates
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeMethod.uses_sprints}
                    onChange={(e) =>
                      updateMethodFlags(activeMethod, { uses_sprints: e.target.checked })
                    }
                  />
                  Uses sprints
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={activeMethod.is_active}
                    disabled={activeMethod.is_system}
                    onChange={(e) =>
                      updateMethodFlags(activeMethod, { is_active: e.target.checked })
                    }
                  />
                  Active (shown on new projects)
                </label>
              </div>
            </SectionFrame>
          )}

          <SectionFrame>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionTitle>
                Stage gates
                {activeMethod ? ` · ${activeMethod.name}` : ""}
              </SectionTitle>
              <button
                onClick={resetToDefaults}
                disabled={saving || !activeMethod?.uses_stage_gates}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> Reset to defaults
              </button>
            </div>

            {!activeMethod ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Select or create a delivery method.
              </div>
            ) : !activeMethod.uses_stage_gates ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                This method does not use stage gates (sprints only). Enable &quot;Uses stage
                gates&quot; above to manage a gate template.
              </div>
            ) : isLoading ? (
              <PageLoading label="Loading…" fullScreen={false} />
            ) : defs.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No stage gates defined for this method. Add one below or reset to defaults.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {defs.map((g: any, idx: number) => (
                  <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="w-8 text-center font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </span>
                    <input
                      defaultValue={g.gate_name}
                      onBlur={(e) =>
                        e.target.value !== g.gate_name && renameGate(g.id, e.target.value)
                      }
                      className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-input focus:border-input focus:outline-none"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={g.is_active}
                        onChange={() => toggleActive(g.id, g.is_active)}
                      />
                      Active
                    </label>
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0 || saving}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === defs.length - 1 || saving}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeGate(g.id)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeMethod?.uses_stage_gates && (
              <div className="mt-4 flex items-end gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Add a stage gate
                  </span>
                  <input
                    value={newGateName}
                    onChange={(e) => setNewGateName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addGate()}
                    placeholder="e.g. UAT Sign-off"
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={addGate}
                  disabled={!newGateName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Save className="h-3.5 w-3.5" /> Changes save automatically.
            </div>
          </SectionFrame>

          {activeMethod?.uses_stage_gates && (
            <StageGateChecklistAdmin
              gateNames={defs
                .filter((d: any) => d.is_active !== false)
                .map((d: any) => d.gate_name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
