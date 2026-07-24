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

  return (
    <th className={`align-top ${className || ""}`}>
      <div className={`flex flex-col gap-1 ${align === "right" ? "items-end" : "items-start"}`}>
        {sortable ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-left font-semibold hover:text-primary"
            onClick={() => onToggleSort?.(column.key)}
            title="Sort"
          >
            <span>{column.label}</span>
            <Icon className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
          </button>
        ) : (
          <span className="font-semibold">{column.label}</span>
        )}
        {filterable ? (
          <input
            className="st-input !h-7 !min-w-[4.5rem] !px-1.5 !py-0.5 !text-[10px] font-normal"
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
