/** Shared pagination helpers for portfolio server queries. */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type PageCursor = {
  /** Offset paging for simplicity + PostgREST `.range()` compatibility. */
  offset: number;
  limit: number;
};

/** JSON-safe row shape for TanStack Start server-fn serialization. */
export type JsonRow = { [key: string]: string | number | boolean | null | JsonRow | JsonRow[] };

export type PageResult<T extends JsonRow = JsonRow> = {
  rows: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export function clampPageSize(raw?: number | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

export function normalizeOffset(raw?: number | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function toPageResult<T extends JsonRow>(
  rows: T[],
  total: number,
  offset: number,
  limit: number,
): PageResult<T> {
  const safeTotal = Math.max(0, Number(total) || 0);
  const next = offset + rows.length;
  const hasMore = next < safeTotal;
  return {
    rows,
    total: safeTotal,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? next : null,
  };
}
