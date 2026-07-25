/**
 * Auth session storage — sessionStorage instead of localStorage.
 *
 * Why: JWTs in localStorage survive browser restarts and are a durable XSS target.
 * sessionStorage clears when the tab/window closes, shrinking the theft window.
 * (XSS can still read sessionStorage while the tab is open — MFA + CSP mitigate.)
 *
 * On first load, any legacy Supabase auth keys in localStorage are migrated here
 * and removed from localStorage.
 */

function migrateLegacyLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      // Supabase JS auth token keys look like sb-<ref>-auth-token
      if (k.includes("-auth-token") || (k.startsWith("sb-") && k.includes("auth"))) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      const v = window.localStorage.getItem(k);
      if (v != null && window.sessionStorage.getItem(k) == null) {
        window.sessionStorage.setItem(k, v);
      }
      window.localStorage.removeItem(k);
    }
  } catch {
    /* private mode / blocked storage */
  }
}

export function createAuthStorage(): Storage {
  if (typeof window === "undefined") {
    const mem = new Map<string, string>();
    return {
      get length() {
        return mem.size;
      },
      clear() {
        mem.clear();
      },
      getItem(key: string) {
        return mem.has(key) ? mem.get(key)! : null;
      },
      key(index: number) {
        return Array.from(mem.keys())[index] ?? null;
      },
      removeItem(key: string) {
        mem.delete(key);
      },
      setItem(key: string, value: string) {
        mem.set(key, value);
      },
    };
  }

  migrateLegacyLocalStorage();
  return window.sessionStorage;
}
