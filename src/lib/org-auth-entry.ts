/**
 * Remembers when the user entered via an organisation white-label sign-in link
 * (`/auth?org=<slug>` or `/o/<slug>/login`) so sign-out returns there instead of
 * the generic `/auth` page.
 */

export const ORG_AUTH_ENTRY_KEY = "pmo:orgAuthEntrySlug";

export function rememberOrgAuthEntry(slug: string | null | undefined) {
  if (typeof window === "undefined") return;
  const s = (slug || "").trim();
  try {
    if (s) window.localStorage.setItem(ORG_AUTH_ENTRY_KEY, s);
    else window.localStorage.removeItem(ORG_AUTH_ENTRY_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearOrgAuthEntry() {
  rememberOrgAuthEntry(null);
}

export function readOrgAuthEntrySlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage.getItem(ORG_AUTH_ENTRY_KEY)?.trim();
    return s || null;
  } catch {
    return null;
  }
}

/** Path to return to after sign-out (org white-label or generic auth). */
export function getPostSignOutAuthPath(): string {
  const slug = readOrgAuthEntrySlug();
  if (slug) return `/auth?org=${encodeURIComponent(slug)}`;
  return "/auth";
}

/** Prefer pretty org login URL when a slug is known. */
export function getOrgAuthLoginPath(slug: string): string {
  const s = slug.trim();
  return s ? `/o/${encodeURIComponent(s)}/login` : "/auth";
}
