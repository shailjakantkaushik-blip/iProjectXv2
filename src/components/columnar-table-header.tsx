import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ColumnSortDir, ColumnarColumn } from "@/hooks/use-columnar-table";

/** Sortable + filterable `<th>` for register / data tables. */
export function ColumnarTh<T>({
  column,
  filter,
  onFilter,
  sortKey,
  sortDir,
  onToggleSort,
  className,
  align = "left",
}: {
  column: ColumnarColumn<T>;
  filter?: string;
  onFilter?: (value: string) => void;
  sortKey?: string | null;
  sortDir?: ColumnSortDir;
  onToggleSort?: (key: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const sortable = column.sortable !== false && !!onToggleSort;
  const filterable = column.filterable !== false && !!onFilter;
  const active = sortKey === column.key && sortDir;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  const right = align === "right";

  return (
    <th
      className={`align-top ${right ? "!text-right" : "!text-left"} ${className || ""}`}
    >
      <div
        className={`flex w-full min-w-0 flex-col gap-1 ${right ? "items-end" : "items-start"}`}
      >
        {sortable ? (
          <button
            type="button"
            className={`inline-flex max-w-full items-center gap-1 font-semibold hover:text-primary ${
              right ? "flex-row-reverse text-right" : "text-left"
            }`}
            onClick={() => onToggleSort?.(column.key)}
            title="Sort"
          >
            <span className="truncate">{column.label}</span>
            <Icon className={`h-3 w-3 shrink-0 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
          </button>
        ) : (
          <span className={`font-semibold ${right ? "text-right" : "text-left"}`}>
            {column.label}
          </span>
        )}
        {filterable ? (
          <input
            className={`st-input !h-8 !min-h-8 !w-full !min-w-0 !max-w-full !px-1.5 !py-1 !text-[11px] font-normal [@media(pointer:coarse)]:!h-9 [@media(pointer:coarse)]:!min-h-9 ${
              right ? "!text-right tabular-nums" : ""
            }`}
            placeholder="Filter…"
            value={filter ?? ""}
            onChange={(e) => onFilter?.(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
      </div>
    </th>
  );
}
