/**
 * Resolve Supabase URL / keys from the common Vercel + Vite alias set.
 * Build-time env-bridge writes VITE_* into the client bundle; at SSR runtime
 * Vercel often only exposes NEXT_PUBLIC_* / SUPABASE_* — accept all of them.
 *
 * IMPORTANT: Vite only inlines `import.meta.env.VITE_*` when accessed as
 * static property reads. Dynamic `import.meta.env[name]` is always undefined
 * in the browser bundle.
 */

function firstDefined(...values: Array<string | undefined | null>): string | undefined {
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

function readProcess(...names: string[]): string | undefined {
  for (const name of names) {
    try {
      const v = process.env?.[name];
      const t = typeof v === "string" ? v.trim() : "";
      if (t) return t;
    } catch {
      /* process may be unavailable in some client bundles */
    }
  }
  return undefined;
}

export function resolveSupabaseUrl(): string | undefined {
  return firstDefined(
    // Static reads — required for Vite client inlining
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined,
    readProcess(
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
    ),
  );
}

/** Publishable / anon key (browser + user-scoped server clients). */
export function resolveSupabasePublishableKey(): string | undefined {
  return firstDefined(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined,
    readProcess(
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    ),
  );
}

/** Service-role key (server admin only — never expose to the browser). */
export function resolveSupabaseServiceRoleKey(): string | undefined {
  return readProcess("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}
