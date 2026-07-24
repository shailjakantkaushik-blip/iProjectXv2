import type { AppRole, Organization, Profile } from "@/lib/auth-context";
// Types-only import — erased at build; no runtime cycle with auth-context.

/** Last-known auth chrome so hard reload can paint the shell instantly. */
export const AUTH_CHROME_CACHE_KEY = "pmo.authChrome.v1";

export type AuthChromeCache = {
  userId: string;
  profile: Profile;
  organization: Organization | null;
  roles: AppRole[];
  at: number;
};

export function readCachedAuthChrome(): AuthChromeCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CHROME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthChromeCache;
    if (!parsed?.userId || !parsed?.profile?.id) return null;
    if (parsed.profile.id !== parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedAuthChrome(input: {
  userId: string;
  profile: Profile;
  organization: Organization | null;
  roles: AppRole[];
}) {
  if (typeof window === "undefined") return;
  try {
    const payload: AuthChromeCache = {
      userId: input.userId,
      profile: input.profile,
      organization: input.organization,
      roles: input.roles,
      at: Date.now(),
    };
    window.localStorage.setItem(AUTH_CHROME_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearCachedAuthChrome() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_CHROME_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
