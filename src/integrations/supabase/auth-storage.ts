/**
 * Auth session storage — sessionStorage instead of localStorage.
 *
 * Why: JWTs in localStorage survive browser restarts and are a durable XSS target.
 * sessionStorage clears when the tab/window closes, shrinking the theft window.
 * (XSS can still read sessionStorage while the tab is open — MFA + CSP mitigate.)
 *
 * Safari / Chrome private windows often throw on localStorage and sessionStorage
 * (QuotaExceeded or SecurityError). Raw sessionStorage would crash the landing
 * loader when creating the Supabase client. Always fall back to memory.
 */

function memoryStorage(): Storage {
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

function wrapStorage(backing: Storage): Storage {
  const mem = memoryStorage();
  const safe = <T,>(fn: () => T, fallback: () => T): T => {
    try {
      return fn();
    } catch {
      return fallback();
    }
  };
  return {
    get length() {
      return safe(() => backing.length, () => mem.length);
    },
    clear() {
      safe(
        () => backing.clear(),
        () => mem.clear(),
      );
    },
    getItem(key: string) {
      return safe(
        () => backing.getItem(key),
        () => mem.getItem(key),
      );
    },
    key(index: number) {
      return safe(
        () => backing.key(index),
        () => mem.key(index),
      );
    },
    removeItem(key: string) {
      safe(
        () => backing.removeItem(key),
        () => mem.removeItem(key),
      );
    },
    setItem(key: string, value: string) {
      safe(
        () => backing.setItem(key, value),
        () => mem.setItem(key, value),
      );
    },
  };
}

function migrateLegacyLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
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
  if (typeof window === "undefined") return memoryStorage();

  migrateLegacyLocalStorage();

  try {
    const probe = "__pmo_auth_probe";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return wrapStorage(window.sessionStorage);
  } catch {
    return memoryStorage();
  }
}
