import { Search, X } from "lucide-react";
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
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-2.5 py-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="h-9 w-full min-w-0 border-border/70 bg-background pl-8 text-sm sm:h-8 sm:text-xs"
          placeholder={placeholder}
          value={globalQ}
          onChange={(e) => onGlobalQ(e.target.value)}
        />
      </div>
      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border">
        {shown === total ? `${total} row${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
      </span>
      {active ? (
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/5 sm:min-h-0 sm:text-[11px]"
          onClick={onClear}
        >
          <X className="h-3 w-3" aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  );
}
