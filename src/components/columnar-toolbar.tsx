import { Input } from "@/components/ui/input";

/** Global search + result count + clear for columnar register tables. */
export function ColumnarToolbar({
  globalQ,
  onGlobalQ,
  shown,
  total,
  onClear,
  dirty,
  placeholder = "Search all columns…",
}: {
  globalQ: string;
  onGlobalQ: (v: string) => void;
  shown: number;
  total: number;
  onClear: () => void;
  /** When true, show Clear even if row counts match (e.g. sort-only). */
  dirty?: boolean;
  placeholder?: string;
}) {
  const active = dirty ?? (globalQ.trim().length > 0 || shown !== total);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <Input
        className="h-8 max-w-xs text-xs"
        placeholder={placeholder}
        value={globalQ}
        onChange={(e) => onGlobalQ(e.target.value)}
      />
      <span className="text-[11px] text-muted-foreground">
        {shown === total ? `${total} row${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
      </span>
      {active ? (
        <button
          type="button"
          className="text-[11px] font-medium text-primary hover:underline"
          onClick={onClear}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
