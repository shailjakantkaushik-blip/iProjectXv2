/**
 * Stale-while-revalidate helpers — show existing UI while data refreshes quietly.
 */

type QueryLike = {
  data?: unknown;
  isLoading?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  isFetched?: boolean;
};

/** True only on a cold load with nothing to show yet. */
export function isColdLoading(q: QueryLike): boolean {
  const hasData = q.data !== undefined && q.data !== null;
  if (hasData) return false;
  return !!(q.isLoading || q.isPending);
}

/** True when a background refetch is running and we already have data. */
export function isSoftUpdating(q: QueryLike): boolean {
  const hasData = q.data !== undefined && q.data !== null;
  return !!(hasData && q.isFetching);
}

/** Supabase / PostgREST errors are plain objects, not always `Error` instances. */
export function queryErrorMessage(
  err: unknown,
  fallback = "A temporary issue interrupted loading. Retry to refresh.",
): string {
  if (!err) return fallback;
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null) {
    const o = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [o.message, o.details, o.hint]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
    if (typeof o.code === "string" && o.code) return `Error ${o.code}`;
  }
  return fallback;
}
