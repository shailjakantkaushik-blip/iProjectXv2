import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const NEW_VALUE = "__new__";

export function ExistingOrNewName({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  newOptionLabel = "New name…",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  newOptionLabel?: string;
}) {
  const known = options.filter(Boolean);
  const current = String(value ?? "").trim();
  const inList = current !== "" && known.some((o) => o === current);
  const [mode, setMode] = useState<"pick" | "new">(inList || current === "" ? "pick" : "new");
  const [draft, setDraft] = useState(inList ? "" : current);

  useEffect(() => {
    const nextInList = current !== "" && known.some((o) => o === current);
    setMode(nextInList || current === "" ? "pick" : "new");
    setDraft(nextInList ? "" : current);
  }, [current, known.join("|")]);

  const selectValue = mode === "new" ? NEW_VALUE : current;

  return (
    <div className="min-w-[12rem] flex-1 space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={selectValue}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW_VALUE) {
            setMode("new");
            setDraft("");
            onChange("");
            return;
          }
          setMode("pick");
          setDraft("");
          onChange(v);
        }}
      >
        <option value="">{placeholder || "Select…"}</option>
        {known.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={NEW_VALUE}>{newOptionLabel}</option>
      </select>
      {mode === "new" ? (
        <Input
          className="h-9 text-sm"
          placeholder={placeholder || "Type a new name"}
          value={draft}
          disabled={disabled}
          aria-label={`New ${label}`}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
        />
      ) : null}
    </div>
  );
}
