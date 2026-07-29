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

type PostgrestLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

const SCHEMA_OPS_RE =
  /schema cache|could not find\b|PGRST20[45]|undefined\s+column|column .+ does not exist|relation .+ does not exist|42703|42P01|missing column|Reload schema|operator does not exist|explicit type casts|42883/i;
const PERMISSION_RE =
  /permission denied|row-level security|not authorized|JWT expired|PGRST301|42501|forbidden|401|403/i;
const NETWORK_RE =
  /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|ECONNRESET|ECONNREFUSED|abort/i;

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Full PostgREST / Error text for console / admin diagnostics — not for end-user UI. */
export function queryErrorDetail(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err.trim();
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null) {
    const o = err as PostgrestLike;
    const parts = [o.message, o.details, o.hint, o.code]
      .map(asTrimmedString)
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  try {
    return String(err);
  } catch {
    return "";
  }
}

function classifyQueryError(raw: string, code?: string): string | null {
  const hay = `${code ?? ""} ${raw}`;
  if (PERMISSION_RE.test(hay)) {
    return "You don’t have permission to view this data.";
  }
  if (NETWORK_RE.test(hay)) {
    return "Network issue. Check your connection and retry.";
  }
  if (SCHEMA_OPS_RE.test(hay)) {
    return "Portfolio data is temporarily unavailable. Retry, or contact an administrator if this continues.";
  }
  return null;
}

/**
 * User-safe query failure text for UI panels.
 * Never surfaces PostgREST `details` / `hint` or schema-cache column names.
 */
export function queryErrorMessage(
  err: unknown,
  fallback = "A temporary issue interrupted loading. Retry to refresh.",
): string {
  if (!err) return fallback;

  if (typeof err === "string") {
    const classified = classifyQueryError(err);
    if (classified) return classified;
    // Bare strings from our own code may be safe; keep short and non-ops.
    if (err.trim() && !SCHEMA_OPS_RE.test(err) && err.length <= 160) return err.trim();
    return fallback;
  }

  if (err instanceof Error) {
    const classified = classifyQueryError(err.message);
    if (classified) return classified;
    // Prefer fallback over raw multi-attempt dumps that may include ops text.
    if (err.message.includes("\n") || /fallback:|financials_monthly:|stage_gates:/i.test(err.message)) {
      return fallback;
    }
    if (err.message && err.message.length <= 160 && !SCHEMA_OPS_RE.test(err.message)) {
      return err.message;
    }
    return fallback;
  }

  if (typeof err === "object" && err !== null) {
    const o = err as PostgrestLike;
    const code = asTrimmedString(o.code);
    const message = asTrimmedString(o.message);
    const classified = classifyQueryError([message, asTrimmedString(o.details), asTrimmedString(o.hint)].join(" "), code);
    if (classified) return classified;
    // PostgREST-shaped errors: never echo details/hint; avoid leaking message when it looks like SQL/schema.
    if (code || asTrimmedString(o.details) || asTrimmedString(o.hint)) {
      return fallback;
    }
    if (message && message.length <= 120 && !SCHEMA_OPS_RE.test(message)) return message;
  }

  return fallback;
}

/** Log full error detail to the console for operators; keep UI on queryErrorMessage. */
export function logQueryError(scope: string, err: unknown): void {
  const detail = queryErrorDetail(err);
  if (!detail) return;
  console.warn(`[${scope}]`, detail);
}
