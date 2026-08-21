import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTablePermission } from "@/lib/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { syncScheduleDates } from "@/lib/project-dates";
import { persistCurrentPhaseFromGates } from "@/lib/project-phase";
import { fetchGateChecklistBlockReason } from "@/lib/stage-gate-checklist";
import { useAuth } from "@/lib/auth-context";

type FieldType = "text" | "number" | "date" | "select" | "select-or-new";

type Props = {
  table: string;
  rowId: string;
  field: string;
  value: string | number | null | undefined;
  type?: FieldType;
  options?: { label: string; value: string }[];
  invalidateKeys?: string[];
  display?: (v: any) => React.ReactNode;
  className?: string;
  /** When true, bypass table matrix (e.g. Data Editor capability grant). */
  forceEditable?: boolean;
};

export function EditableCell({
  table, rowId, field, value, type = "text", options, invalidateKeys, display, className, forceEditable,
}: Props) {
  const { canEdit: tableEdit } = useTablePermission(table);
  const canEdit = !!forceEditable || tableEdit;
  const { organization } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const rendered = display ? display(value) : (value === null || value === undefined || value === "" ? <span className="text-muted-foreground">—</span> : String(value));

  if (!canEdit) return <span className={className}>{rendered}</span>;

  const commit = async () => {
    setSaving(true);
    try {
      let payload: any = draft;
      if (type === "number") payload = draft === "" ? null : Number(draft);
      if (type === "date") payload = draft === "" ? null : draft;
      if (type === "text" && draft === "") payload = null;
      if (type === "select" && draft === "") payload = null;
      if (type === "select-or-new" && draft === "") payload = null;

      // Governance: block Approve when required checklist items are open,
      // then copy status onto every row of the same project + gate name.
      if (table === "stage_gates" && field === "status") {
        const { data: gate } = await (supabase as any)
          .from("stage_gates")
          .select("id,gate_name,org_id,project_id")
          .eq("id", rowId)
          .maybeSingle();
        if (/approved/i.test(String(payload || "")) && organization?.id) {
          const reason = await fetchGateChecklistBlockReason(supabase as any, {
            orgId: gate?.org_id || organization.id,
            stageGateId: rowId,
            gateName: String(gate?.gate_name || ""),
          });
          if (reason) throw new Error(reason);
        }
        const { setStageGateStatus } = await import("@/lib/stage-gate-approval");
        await setStageGateStatus({
          gateId: rowId,
          projectId: String(gate?.project_id || ""),
          status: String(payload || "Pending"),
        });
      } else if (
        table === "projects" &&
        [
          "planned_start_date",
          "planned_end_date",
          "actual_start_date",
          "actual_end_date",
          "start_date",
          "end_date",
        ].includes(field)
      ) {
        const { data: row } = await (supabase as any)
          .from("projects")
          .select(
            "planned_start_date,planned_end_date,actual_start_date,actual_end_date,start_date,end_date",
          )
          .eq("id", rowId)
          .maybeSingle();
        const synced = syncScheduleDates({ ...(row ?? {}), [field]: payload });
        const { error } = await (supabase as any)
          .from("projects")
          .update({
            planned_start_date: synced.planned_start_date,
            planned_end_date: synced.planned_end_date,
            actual_start_date: synced.actual_start_date,
            actual_end_date: synced.actual_end_date,
            start_date: synced.start_date,
            end_date: synced.end_date,
          })
          .eq("id", rowId);
        if (error) throw error;
      } else if (
        organization?.byod_active &&
        organization.id &&
        (table === "risks" || table === "issues" || table === "actions")
      ) {
        const {
          upsertOrgRisk,
          upsertOrgIssue,
          upsertOrgAction,
        } = await import("@/lib/tenant-raid.functions");
        const patch = { [field]: payload };
        if (table === "risks") {
          await upsertOrgRisk({
            data: { orgId: organization.id, id: rowId, patch },
          });
        } else if (table === "issues") {
          await upsertOrgIssue({
            data: { orgId: organization.id, id: rowId, patch },
          });
        } else {
          await upsertOrgAction({
            data: { orgId: organization.id, id: rowId, patch },
          });
        }
      } else {
        const { error } = await (supabase as any).from(table).update({ [field]: payload }).eq("id", rowId);
        if (error) throw error;
      }

      // Stage gates → mirror current phase onto the project for app-wide filters.
      if (table === "stage_gates" && field === "gate_name") {
        const { data: gate } = await (supabase as any)
          .from("stage_gates")
          .select("project_id")
          .eq("id", rowId)
          .maybeSingle();
        if (gate?.project_id) {
          await persistCurrentPhaseFromGates(supabase as any, gate.project_id);
        }
      }

      toast.success("Saved — syncing across app");
      setEditing(false);
      // Scoped invalidation only — never wipe the whole query cache.
      const keys = new Set<string>([table, ...(invalidateKeys ?? [])]);
      if (table === "stage_gates") {
        keys.add("projects");
        keys.add("project");
      }
      for (const k of keys) {
        void qc.invalidateQueries({ queryKey: [k], refetchType: "active" });
      }
      try {
        window.dispatchEvent(
          new CustomEvent("pmo:data-changed", { detail: { table, rowId, field } }),
        );
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          const current = value == null ? "" : String(value);
          const known = (options ?? []).some((o) => o.value === current);
          setCreating(type === "select-or-new" && !!current && !known);
          setEditing(true);
        }}
        className={`group inline-flex items-center gap-1 rounded px-1 -mx-1 text-left hover:bg-accent/60 ${className ?? ""}`}
        title="Click to edit"
      >
        <span>{rendered}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }

  const NEW = "__new__";
  const selectOrNewValue = type === "select-or-new" && creating ? NEW : draft;

  return (
    <span className="inline-flex items-center gap-1">
      {type === "select" || type === "select-or-new" ? (
        <>
          <select
            ref={inputRef as any}
            value={type === "select-or-new" ? selectOrNewValue : draft}
            onChange={(e) => {
              const v = e.target.value;
              if (type === "select-or-new" && v === NEW) {
                setCreating(true);
                setDraft("");
                return;
              }
              setCreating(false);
              setDraft(v);
            }}
            className="h-7 rounded border bg-background px-1 text-xs"
            disabled={saving}
          >
            <option value="">—</option>
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {type === "select-or-new" ? <option value={NEW}>+ New…</option> : null}
          </select>
          {type === "select-or-new" && creating ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-7 w-full min-w-[80px] rounded border bg-background px-1 text-xs"
              placeholder="New name"
              disabled={saving}
            />
          ) : null}
        </>
      ) : (
        <input
          ref={inputRef as any}
          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-full min-w-[80px] rounded border bg-background px-1 text-xs"
          disabled={saving}
        />
      )}
      <button type="button" onClick={commit} disabled={saving} className="text-green-600 hover:text-green-700">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => { setEditing(false); setDraft(value == null ? "" : String(value)); }} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
