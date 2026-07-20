import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTablePermission } from "@/lib/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type FieldType = "text" | "number" | "date" | "select";

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
};

export function EditableCell({
  table, rowId, field, value, type = "text", options, invalidateKeys, display, className,
}: Props) {
  const { canEdit } = useTablePermission(table);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);
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
      const { error } = await (supabase as any).from(table).update({ [field]: payload }).eq("id", rowId);
      if (error) throw error;
      toast.success("Saved — syncing across app");
      setEditing(false);
      // Broad invalidation so every dashboard/chart/table that reads from
      // this data recomputes immediately — no page reload needed.
      (invalidateKeys ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      await qc.invalidateQueries();
      try { window.dispatchEvent(new CustomEvent("pmo:data-changed", { detail: { table, rowId, field } })); } catch {}
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
        onClick={() => setEditing(true)}
        className={`group inline-flex items-center gap-1 rounded px-1 -mx-1 text-left hover:bg-accent/60 ${className ?? ""}`}
        title="Click to edit"
      >
        <span>{rendered}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {type === "select" ? (
        <select
          ref={inputRef as any}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 rounded border bg-background px-1 text-xs"
          disabled={saving}
        >
          <option value="">—</option>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
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
