/**
 * Unwrap a Supabase-style `{ data, error }` response or throw —
 * prevents silent empty data when a query fails.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Unwrap a list query; returns [] when data is null (after error check).
 */
export function unwrapList<T>(result: {
  data: T[] | null;
  error: { message: string } | null;
}): T[] {
  if (result.error) throw result.error;
  return result.data ?? [];
}

/** Exponential backoff for React Query retries (capped). */
export function queryRetryDelay(attemptIndex: number) {
  return Math.min(1000 * 2 ** attemptIndex, 12_000);
}
