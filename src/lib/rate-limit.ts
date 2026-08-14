/**
 * Rate limiting: in-process first, optional durable Postgres bucket for multi-instance.
 *
 * Set RATE_LIMIT_DURABLE=1 (and service role env) to use public.check_rate_limit_bucket.
 * Always pair with edge/WAF rules in production (Vercel Firewall / Cloudflare).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Best-effort client key from request headers. */
export function clientKeyFromHeaders(headers?: Headers | null, fallback = "anon"): string {
  if (!headers) return fallback;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || fallback;
}

/**
 * Durable rate limit via Postgres when RATE_LIMIT_DURABLE=1.
 * Falls back to in-process on any error / when disabled.
 */
export async function checkRateLimitDurable(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const local = checkRateLimit(opts);
  if (!local.ok) return local;

  if (process.env.RATE_LIMIT_DURABLE !== "1" && process.env.RATE_LIMIT_DURABLE !== "true") {
    return local;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return local;
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("check_rate_limit_bucket", {
      _key: opts.key,
      _limit: opts.limit,
      _window_seconds: Math.max(1, Math.ceil(opts.windowMs / 1000)),
    });
    if (error) return local;
    const row = data as { ok?: boolean; retry_after_sec?: number } | null;
    if (row && row.ok === false) {
      return { ok: false, retryAfterSec: Math.max(1, Number(row.retry_after_sec) || 1) };
    }
    return { ok: true };
  } catch {
    return local;
  }
}
