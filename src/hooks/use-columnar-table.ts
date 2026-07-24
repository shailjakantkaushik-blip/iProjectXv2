import { useMemo, useState } from "react";

export type ColumnSortDir = "asc" | "desc" | null;

export type ColumnarColumn<T> = {
  key: string;
  label: string;
  /** Value used for filter / sort / search. Defaults to row[key]. */
  getValue?: (row: T) => unknown;
  /** Disable per-column filter input. */
  filterable?: boolean;
  /** Disable sort on this column. */
  sortable?: boolean;
};

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = cellText(a).toLowerCase();
  const bs = cellText(b).toLowerCase();
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

/**
 * Shared column filter / sort / search for data-table sections.
 * Global search matches any column; per-column filters AND together.
 */
export function useColumnarTable<T>(rows: T[], columns: ColumnarColumn<T>[]) {
  const [globalQ, setGlobalQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<ColumnSortDir>(null);

  const valueOf = (row: T, col: ColumnarColumn<T>) =>
    col.getValue ? col.getValue(row) : (row as any)?.[col.key];

  const setColumnFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") setSortDir("desc");
    else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    } else setSortDir("asc");
  };

  const clearAll = () => {
    setGlobalQ("");
    setFilters({});
    setSortKey(null);
    setSortDir(null);
  };

  const filtered = useMemo(() => {
    const needle = globalQ.trim().toLowerCase();
    let list = rows.filter((row) => {
      for (const col of columns) {
        if (col.filterable === false) continue;
        const f = filters[col.key];
        if (!f) continue;
        const text = cellText(valueOf(row, col)).toLowerCase();
        if (!text.includes(f.trim().toLowerCase())) return false;
      }
      if (!needle) return true;
      return columns.some((col) => cellText(valueOf(row, col)).toLowerCase().includes(needle));
    });

    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey);
      if (col && col.sortable !== false) {
        list = list.slice().sort((a, b) => {
          const cmp = compareValues(valueOf(a, col), valueOf(b, col));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
    // valueOf is stable per columns; eslint can't see that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, filters, globalQ, sortKey, sortDir]);

  return {
    rows: filtered,
    total: rows.length,
    globalQ,
    setGlobalQ,
    filters,
    setColumnFilter,
    sortKey,
    sortDir,
    toggleSort,
    clearAll,
  };
}
