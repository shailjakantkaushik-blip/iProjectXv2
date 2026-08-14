/**
 * Resolve Supabase URL / keys from the common Vercel + Vite alias set.
 * Build-time env-bridge writes VITE_* into the client bundle; at SSR runtime
 * Vercel often only exposes NEXT_PUBLIC_* / SUPABASE_* — accept all of them.
 */

function firstDefined(...values: Array<string | undefined | null>): string | undefined {
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

function viteEnv(name: string): string | undefined {
  try {
    const env = import.meta.env as Record<string, string | undefined>;
    return env?.[name];
  } catch {
    return undefined;
  }
}

export function resolveSupabaseUrl(): string | undefined {
  return firstDefined(
    viteEnv("VITE_SUPABASE_URL"),
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
}

/** Publishable / anon key (browser + user-scoped server clients). */
export function resolveSupabasePublishableKey(): string | undefined {
  return firstDefined(
    viteEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  );
}

/** Service-role key (server admin only — never expose to the browser). */
export function resolveSupabaseServiceRoleKey(): string | undefined {
  return firstDefined(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  );
}
