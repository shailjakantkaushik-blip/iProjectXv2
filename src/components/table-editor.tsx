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
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";

interface LookupMaps {
  projectsById: Map<string, string>;
  projectsByCode: Map<string, string>;
  busById: Map<string, string>;
  busByCode: Map<string, string>;
  resourcesById: Map<string, string>;
  resourcesByName: Map<string, string>;
  streamsById: Map<string, string>;
  streamsByCode: Map<string, string>;
  /** project_id → default stream id (Core) for autopopulate */
  defaultStreamByProject: Map<string, string>;
  /** stage_gate id → gate name (phase) */
  gatesById: Map<string, string>;
  /** label → stage_gate id (best-effort import; accepts legacy "name · stream · date") */
  gatesByLabel: Map<string, string>;
  /** sprint id → display label (#N · name) */
  sprintsById: Map<string, string>;
  /** label / #N / name → sprint id */
  sprintsByLabel: Map<string, string>;
  /** profile id → display label (name / email) — never show raw UUID in the grid */
  usersById: Map<string, string>;
  /** email or full_name (lower) → profile id for add-row / import */
  usersByLabel: Map<string, string>;
  /** options for user selects */
  userOptions: { label: string; value: string }[];
}

export function TableEditor({ def }: { def: TableDef }) {
  const { organization } = useAuth();
  const dataEditorCap = useCapabilityPermission("data_editor");
  const tablePerm = useTablePermission(def.key);
  const canEdit = dataEditorCap.canEdit || tablePerm.canEdit;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: lookups } = useQuery({
    queryKey: ["editor-lookups", organization?.id, "v2-user-labels"],
    enabled: !!organization,
    queryFn: async (): Promise<LookupMaps> => {
      const [
        { data: projects },
        { data: bus },
        { data: resources },
        { data: streams },
        gatesRes,
        sprintsRes,
        { data: profiles },
      ] = await Promise.all([
          supabase.from("projects").select("id,project_code,name").eq("org_id", organization!.id),
          supabase.from("business_units").select("id,code,name").eq("org_id", organization!.id),
          supabase.from("resources").select("id,name,email,user_id").eq("org_id", organization!.id),
          supabase.from("project_streams").select("id,code,name,project_id,is_default").eq("org_id", organization!.id),
          supabase
            .from("stage_gates")
            .select("id,project_id,stream_id,gate_name,planned_date,status")
            .eq("org_id", organization!.id)
            .order("planned_date"),
          supabase
            .from("sprints")
            .select("id,project_id,sprint_number,name")
            .eq("org_id", organization!.id)
            .order("sprint_number"),
          supabase.from("profiles").select("id,full_name,email").eq("org_id", organization!.id),
        ]);
      const projectsById = new Map((projects ?? []).map((p) => [p.id, p.project_code || p.name]));
      const projectsByCode = new Map<string, string>();
      (projects ?? []).forEach((p) => { if (p.project_code) projectsByCode.set(p.project_code, p.id); });
      const busById = new Map((bus ?? []).map((b) => [b.id, b.code || b.name]));
      const busByCode = new Map<string, string>();
      (bus ?? []).forEach((b) => { if (b.code) busByCode.set(b.code, b.id); });
      const resourcesById = new Map((resources ?? []).map((r: any) => [r.id, r.name]));
      const resourcesByName = new Map<string, string>();
      (resources ?? []).forEach((r: any) => { if (r.name) resourcesByName.set(r.name, r.id); });
      const streamsById = new Map((streams ?? []).map((s: any) => [s.id, s.code || s.name || s.id]));
      const streamsByCode = new Map<string, string>();
      const defaultStreamByProject = new Map<string, string>();
      (streams ?? []).forEach((s: any) => {
        if (s.code) streamsByCode.set(String(s.code).trim(), s.id);
        if (s.name) streamsByCode.set(String(s.name).trim(), s.id);
        if (s.is_default) defaultStreamByProject.set(s.project_id, s.id);
      });
      const gatesById = new Map<string, string>();
      const gatesByLabel = new Map<string, string>();
      (gatesRes.data ?? []).forEach((g: any) => {
        const name = String(g.gate_name || "Gate").trim() || "Gate";
        const streamLbl = g.stream_id ? streamsById.get(g.stream_id) : null;
        const date = g.planned_date ? String(g.planned_date).slice(0, 10) : null;
        // Display: gate name only (stream/date are separate columns on the sheet).
        gatesById.set(g.id, name);
        gatesByLabel.set(name, g.id);
        // Legacy composite labels from older imports / displays still resolve.
        const legacy = [name, streamLbl, date].filter(Boolean).join(" · ");
        if (legacy && legacy !== name) gatesByLabel.set(legacy, g.id);
      });
      const sprintsById = new Map<string, string>();
      const sprintsByLabel = new Map<string, string>();
      (sprintsRes.data ?? []).forEach((s: any) => {
        const num = s.sprint_number != null ? `#${s.sprint_number}` : "Sprint";
        const name = String(s.name || "").trim();
        const label = name ? `${num} · ${name}` : num;
        sprintsById.set(s.id, label);
        sprintsByLabel.set(label, s.id);
        sprintsByLabel.set(num, s.id);
        if (name) sprintsByLabel.set(name, s.id);
        if (s.sprint_number != null) sprintsByLabel.set(String(s.sprint_number), s.id);
      });
      const usersById = new Map<string, string>();
      const usersByLabel = new Map<string, string>();
      const userOptions: { label: string; value: string }[] = [];
      const addUser = (id: string | null | undefined, labelRaw: string) => {
        if (!id) return;
        const label = labelRaw.trim() || "Unknown user";
        // Prefer profile names; don't overwrite a good label with a weaker one.
        if (!usersById.has(id) || usersById.get(id) === "Unknown user") {
          usersById.set(id, label);
        }
        usersByLabel.set(label.toLowerCase(), id);
      };
      (profiles ?? []).forEach((p: any) => {
        const label =
          String(p.full_name || "").trim() ||
          String(p.email || "").trim() ||
          "Unknown user";
        addUser(p.id, label);
        if (p.email) usersByLabel.set(String(p.email).trim().toLowerCase(), p.id);
        if (p.full_name) usersByLabel.set(String(p.full_name).trim().toLowerCase(), p.id);
      });
      // Fallback: resource rows already link logins — use resource name when profile is missing.
      (resources ?? []).forEach((r: any) => {
        if (!r.user_id) return;
        const label =
          String(r.name || "").trim() ||
          String(r.email || "").trim() ||
          "Unknown user";
        addUser(r.user_id, label);
        if (r.email) usersByLabel.set(String(r.email).trim().toLowerCase(), r.user_id);
        if (r.name) usersByLabel.set(String(r.name).trim().toLowerCase(), r.user_id);
      });
      for (const [id, label] of usersById) {
        userOptions.push({ label, value: id });
      }
      userOptions.sort((a, b) => a.label.localeCompare(b.label));
      return {
        projectsById,
        projectsByCode,
        busById,
        busByCode,
        resourcesById,
        resourcesByName,
        streamsById,
        streamsByCode,
        defaultStreamByProject,
        gatesById,
        gatesByLabel,
        sprintsById,
        sprintsByLabel,
        usersById,
        usersByLabel,
        userOptions,
      };
    },
  });

  const editorSelect = useMemo(() => {
    const cols = new Set<string>(["id", "org_id"]);
    for (const f of def.fields) cols.add(f.key);
    if (def.orderBy) cols.add(def.orderBy);
    return [...cols].join(",");
  }, [def]);

  const { data: rows = [], refetch } = useQuery({
    queryKey: [def.key, organization?.id],
    enabled: !!organization,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(def.key)
        .select(editorSelect)
        .eq("org_id", organization!.id)
        .order(def.orderBy ?? "created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const columns: ColumnarColumn<any>[] = useMemo(
    () =>
      def.fields.map((f) => ({
        key: f.key,
        label: f.label,
        getValue: (row: any) => {
          const v = row[f.key];
          if (v == null || v === "") return "";
          if (f.fk === "project") return lookups?.projectsById.get(String(v)) ?? "";
          if (f.fk === "bu") return lookups?.busById.get(String(v)) ?? "";
          if (f.fk === "stream") return lookups?.streamsById.get(String(v)) ?? "";
          if (f.fk === "stage_gate") return lookups?.gatesById.get(String(v)) ?? "";
          if (f.fk === "sprint") return lookups?.sprintsById.get(String(v)) ?? "";
          if (f.fk === "user") return lookups?.usersById.get(String(v)) ?? "";
          if (f.key === "resource_id") return lookups?.resourcesById.get(String(v)) ?? "";
          return v;
        },
      })),
    [def.fields, lookups],
  );

  const table = useColumnarTable(rows, columns);

  const removeRow = async (id: string) => {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    const { error } = await (supabase as any).from(def.key).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted — syncing across app");
    refetch();
    void qc.invalidateQueries({ queryKey: [def.key], refetchType: "active" });
    try {
      window.dispatchEvent(
        new CustomEvent("pmo:data-changed", { detail: { table: def.key, op: "delete", id } }),
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      {def.description && <p className="text-sm text-muted-foreground">{def.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search all columns…"
          value={table.globalQ}
          onChange={(e) => table.setGlobalQ(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">{table.rows.length} of {table.total} rows</span>
        {(table.globalQ || Object.keys(table.filters).length > 0 || table.sortKey) && (
          <Button size="sm" variant="ghost" onClick={table.clearAll}>Clear filters</Button>
        )}
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
            void qc.invalidateQueries({ queryKey: [def.key], refetchType: "active" });
            try {
              window.dispatchEvent(
                new CustomEvent("pmo:data-changed", {
                  detail: { table: def.key, op: "insert" },
                }),
              );
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      <div className="overflow-auto rounded-md border">
        <table className="st-table text-xs">
          <thead>
            <tr>
              {columns.map((col) => (
                <ColumnarTh
                  key={col.key}
                  column={col}
                  filter={table.filters[col.key]}
                  onFilter={(v) => table.setColumnFilter(col.key, v)}
                  sortKey={table.sortKey}
                  sortDir={table.sortDir}
                  onToggleSort={table.toggleSort}
                />
              ))}
              {canEdit && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr><td colSpan={def.fields.length + 1} className="py-6 text-center text-muted-foreground">No rows</td></tr>
            ) : table.rows.map((row: any) => (
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
  if (field.fk === "project") {
    return <span className="font-mono">{v ? lookups?.projectsById.get(String(v)) ?? "—" : "—"}</span>;
  }
  if (field.fk === "bu") return <span>{v ? lookups?.busById.get(String(v)) ?? "—" : "—"}</span>;
  if (field.fk === "stream") {
    return <span className="font-mono">{v ? lookups?.streamsById.get(String(v)) ?? "—" : "—"}</span>;
  }
  if (field.fk === "stage_gate") {
    return <span>{v ? lookups?.gatesById.get(String(v)) ?? "—" : "—"}</span>;
  }
  if (field.fk === "sprint") {
    return <span>{v ? lookups?.sprintsById.get(String(v)) ?? "—" : "—"}</span>;
  }
  if (field.key === "resource_id") {
    return <span>{v ? lookups?.resourcesById.get(String(v)) ?? "—" : "—"}</span>;
  }
  if (field.fk === "user") {
    const options = [{ label: "— None —", value: "" }, ...(lookups?.userOptions ?? [])];
    // Always resolve to a human label — never render a raw auth UUID in the grid.
    return (
      <EditableCell
        table={def.key}
        rowId={row.id}
        field={field.key}
        value={v ?? ""}
        type="select"
        options={options}
        display={(val) => {
          if (!val) return <span className="text-muted-foreground">—</span>;
          const resolved = lookups?.usersById.get(String(val));
          if (resolved) return resolved;
          return <span className="text-muted-foreground">Unknown user</span>;
        }}
        forceEditable={forceEditable}
      />
    );
  }

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
        } else if (f.fk === "stream") {
          const id = lookups.streamsByCode.get(v);
          if (!id) throw new Error(`Unknown stream code: ${v}`);
          payload[f.key] = id;
        } else if (f.fk === "stage_gate") {
          const resolved = lookups.gatesByLabel.get(v) || (lookups.gatesById.has(v) ? v : null);
          if (!resolved) throw new Error(`Unknown stage gate: ${v}`);
          payload[f.key] = resolved;
        } else if (f.fk === "sprint") {
          const resolved = lookups.sprintsByLabel.get(v) || (lookups.sprintsById.has(v) ? v : null);
          if (!resolved) throw new Error(`Unknown sprint: ${v}`);
          payload[f.key] = resolved;
        } else if (f.fk === "user") {
          const id =
            lookups.usersByLabel.get(v.trim().toLowerCase()) ||
            (lookups.usersById.has(v) ? v : null);
          if (!id) throw new Error(`Unknown user: ${v}`);
          payload[f.key] = id;
        } else if (f.key === "resource_id") {
          const id = lookups.resourcesByName.get(v);
          if (!id) throw new Error(`Unknown resource: ${v}`);
          payload[f.key] = id;
        } else if (f.type === "number") payload[f.key] = Number(v) || 0;
        else if (f.type === "select" && f.options?.includes("true")) payload[f.key] = v === "true";
        else payload[f.key] = v;
      }
      // Autopopulate default Core stream when stream_id blank but project has streams.
      if (
        def.fields.some((f) => f.key === "stream_id") &&
        !payload.stream_id &&
        payload.project_id
      ) {
        const defStream = lookups.defaultStreamByProject.get(String(payload.project_id));
        if (defStream) payload.stream_id = defStream;
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
              {f.fk === "stream" && <span className="ml-1 normal-case text-muted-foreground">(stream_code)</span>}
              {f.fk === "stage_gate" && <span className="ml-1 normal-case text-muted-foreground">(gate name)</span>}
              {f.fk === "sprint" && <span className="ml-1 normal-case text-muted-foreground">(#N · name)</span>}
              {f.fk === "user" && <span className="ml-1 normal-case text-muted-foreground">(name / email)</span>}
              {f.key === "resource_id" && <span className="ml-1 normal-case text-muted-foreground">(name)</span>}
            </label>
            {f.fk === "user" ? (
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-8 w-full rounded border bg-background px-2 text-xs"
              >
                <option value="">—</option>
                {lookups.userOptions.map((o) => (
                  <option key={o.value} value={o.label}>{o.label}</option>
                ))}
              </select>
            ) : f.type === "select" && f.options ? (
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
