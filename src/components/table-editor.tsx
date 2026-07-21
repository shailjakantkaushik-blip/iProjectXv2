import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { TableDef, FieldDef } from "@/lib/data-tables";
import { EditableCell } from "@/components/editable-cell";
import { useCapabilityPermission, useTablePermission } from "@/lib/permissions";

interface LookupMaps {
  projectsById: Map<string, string>;
  projectsByCode: Map<string, string>;
  busById: Map<string, string>;
  busByCode: Map<string, string>;
  resourcesById: Map<string, string>;
  resourcesByName: Map<string, string>;
}

export function TableEditor({ def }: { def: TableDef }) {
  const { organization } = useAuth();
  const dataEditorCap = useCapabilityPermission("data_editor");
  const tablePerm = useTablePermission(def.key);
  const canEdit = dataEditorCap.canEdit || tablePerm.canEdit;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: lookups } = useQuery({
    queryKey: ["editor-lookups", organization?.id],
    enabled: !!organization,
    queryFn: async (): Promise<LookupMaps> => {
      const [{ data: projects }, { data: bus }, { data: resources }] = await Promise.all([
        supabase.from("projects").select("id,project_code,name").eq("org_id", organization!.id),
        supabase.from("business_units").select("id,code,name").eq("org_id", organization!.id),
        supabase.from("resources").select("id,name").eq("org_id", organization!.id),
      ]);
      const projectsById = new Map((projects ?? []).map((p) => [p.id, p.project_code || p.name]));
      const projectsByCode = new Map<string, string>();
      (projects ?? []).forEach((p) => { if (p.project_code) projectsByCode.set(p.project_code, p.id); });
      const busById = new Map((bus ?? []).map((b) => [b.id, b.code || b.name]));
      const busByCode = new Map<string, string>();
      (bus ?? []).forEach((b) => { if (b.code) busByCode.set(b.code, b.id); });
      const resourcesById = new Map((resources ?? []).map((r) => [r.id, r.name]));
      const resourcesByName = new Map<string, string>();
      (resources ?? []).forEach((r) => { if (r.name) resourcesByName.set(r.name, r.id); });
      return { projectsById, projectsByCode, busById, busByCode, resourcesById, resourcesByName };
    },
  });

  const { data: rows = [], refetch } = useQuery({
    queryKey: [def.key, organization?.id],
    enabled: !!organization,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(def.key)
        .select("*")
        .eq("org_id", organization!.id)
        .order(def.orderBy ?? "created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r: any) =>
      def.fields.some((f) => {
        const v = r[f.key];
        if (v == null) return false;
        if (f.fk === "project") return (lookups?.projectsById.get(String(v)) ?? "").toLowerCase().includes(needle);
        if (f.fk === "bu") return (lookups?.busById.get(String(v)) ?? "").toLowerCase().includes(needle);
        return String(v).toLowerCase().includes(needle);
      })
    );
  }, [rows, q, def, lookups]);

  const removeRow = async (id: string) => {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    const { error } = await (supabase as any).from(def.key).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted — syncing across app");
    refetch();
    await qc.invalidateQueries();
    try { window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: def.key, op: "delete", id } })); } catch {}
  };

  return (
    <div className="space-y-3">
      {def.description && <p className="text-sm text-muted-foreground">{def.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length} rows</span>
        <div className="ml-auto flex gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd((s) => !s)}>
              <Plus className="mr-1 h-4 w-4" />{showAdd ? "Cancel" : "Add row"}
            </Button>
          )}
        </div>
      </div>

      {showAdd && canEdit && lookups && (
        <AddRowForm
          def={def}
          lookups={lookups}
          orgId={organization!.id}
          onDone={async () => {
            setShowAdd(false);
            refetch();
            await qc.invalidateQueries();
            try { window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table: def.key, op: "insert" } })); } catch {}
          }}
        />
      )}

      <div className="overflow-auto rounded-md border">
        <table className="st-table text-xs">
          <thead>
            <tr>
              {def.fields.map((f) => <th key={f.key}>{f.label}</th>)}
              {canEdit && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={def.fields.length + 1} className="py-6 text-center text-muted-foreground">No rows</td></tr>
            ) : filtered.map((row: any) => (
              <tr key={row.id}>
                {def.fields.map((f) => (
                  <td key={f.key} className="align-top">
                    <CellRenderer
                      def={def}
                      field={f}
                      row={row}
                      lookups={lookups}
                      forceEditable={dataEditorCap.canEdit}
                    />
                  </td>
                ))}
                {canEdit && (
                  <td>
                    <button onClick={() => removeRow(row.id)} className="text-muted-foreground hover:text-destructive" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellRenderer({
  def,
  field,
  row,
  lookups,
  forceEditable,
}: {
  def: TableDef;
  field: FieldDef;
  row: any;
  lookups?: LookupMaps;
  forceEditable?: boolean;
}) {
  const v = row[field.key];
  // FK columns: read-only display (change via Add row or Project register).
  if (field.fk === "project") return <span className="font-mono">{lookups?.projectsById.get(String(v)) ?? "—"}</span>;
  if (field.fk === "bu") return <span>{lookups?.busById.get(String(v)) ?? "—"}</span>;
  if (field.key === "resource_id") return <span>{lookups?.resourcesById.get(String(v)) ?? "—"}</span>;

  const type = field.type === "textarea" ? "text" : field.type === "select" ? "select" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  const options = field.options?.map((o) => ({ label: o, value: o }));
  const display = field.type === "number" ? (val: any) => (val == null || val === "" ? "—" : Number(val).toLocaleString()) : undefined;
  return (
    <EditableCell
      table={def.key}
      rowId={row.id}
      field={field.key}
      value={v}
      type={type as any}
      options={options}
      display={display}
      forceEditable={forceEditable}
    />
  );
}

function AddRowForm({ def, lookups, orgId, onDone }: { def: TableDef; lookups: LookupMaps; orgId: string; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { org_id: orgId };
      for (const f of def.fields) {
        const v = values[f.key];
        if (v == null || v === "") {
          if (f.required) throw new Error(`${f.label} is required`);
          continue;
        }
        if (f.fk === "project") {
          const id = lookups.projectsByCode.get(v);
          if (!id) throw new Error(`Unknown project code: ${v}`);
          payload[f.key] = id;
        } else if (f.fk === "bu") {
          const id = lookups.busByCode.get(v);
          if (!id) throw new Error(`Unknown BU code: ${v}`);
          payload[f.key] = id;
        } else if (f.key === "resource_id") {
          const id = lookups.resourcesByName.get(v);
          if (!id) throw new Error(`Unknown resource: ${v}`);
          payload[f.key] = id;
        } else if (f.type === "number") payload[f.key] = Number(v) || 0;
        else if (f.type === "select" && f.options?.includes("true")) payload[f.key] = v === "true";
        else payload[f.key] = v;
      }
      if (def.key === "projects") {
        const { syncScheduleDates } = await import("@/lib/project-dates");
        Object.assign(payload, syncScheduleDates(payload as any));
      }
      const { error } = await (supabase as any).from(def.key).insert(payload);
      if (error) throw error;
      if (def.key === "stage_gates" && payload.project_id) {
        const { persistCurrentPhaseFromGates } = await import("@/lib/project-phase");
        await persistCurrentPhaseFromGates(supabase as any, String(payload.project_id));
      }
      toast.success("Row added");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-md border bg-muted/30 p-3">
      <div className="grid gap-2 md:grid-cols-3">
        {def.fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-muted-foreground">
              {f.label}{f.required && <span className="text-destructive"> *</span>}
              {f.fk === "project" && <span className="ml-1 normal-case text-muted-foreground">(project_code)</span>}
              {f.fk === "bu" && <span className="ml-1 normal-case text-muted-foreground">(bu_code)</span>}
              {f.key === "resource_id" && <span className="ml-1 normal-case text-muted-foreground">(name)</span>}
            </label>
            {f.type === "select" && f.options ? (
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              >
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                rows={2}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save row"}</Button>
      </div>
    </form>
  );
}
