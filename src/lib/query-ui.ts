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
