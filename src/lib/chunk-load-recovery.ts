const RELOAD_KEY = "pmo:chunk-reload";
/** Set for the whole tab session after one automatic recovery — never auto-cleared. */
const AUTO_RECOVERED_KEY = "pmo:chunk-auto-recovered";
const RELOAD_COOLDOWN_MS = 120_000;

/** True when a Vite/browser dynamic import failed (usually after a new deploy). */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String((error as { message?: unknown } | null)?.message ?? error ?? "");

  const name =
    error instanceof Error
      ? error.name
      : String((error as { name?: unknown } | null)?.name ?? "");

  // vite:preloadError synthetic messages
  if (/vite:preloadError/i.test(message) || /vite:preloadError/i.test(name)) {
    return true;
  }

  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w.-]+ failed/i.test(message) ||
    /ChunkLoadError/i.test(name) ||
    /ChunkLoadError/i.test(message) ||
    // Stale index often serves HTML for a missing .js chunk
    (/Unexpected token\s*['"]?</i.test(message) && /module|import|chunk/i.test(message)) ||
    (/Failed to fetch/i.test(message) && /chunk|module|assets\//i.test(message))
  );
}

export function recentlyReloadedForChunk(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** True if this tab already did one automatic deploy recovery. */
export function alreadyAutoRecoveredThisSession(): boolean {
  try {
    return sessionStorage.getItem(AUTO_RECOVERED_KEY) === "1";
  } catch {
    return false;
  }
}

function markReloaded(auto: boolean) {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    if (auto) sessionStorage.setItem(AUTO_RECOVERED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Clear cooldown + session flags (manual "Go home" / user-driven recovery). */
export function clearChunkReloadMarker() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
    sessionStorage.removeItem(AUTO_RECOVERED_KEY);
  } catch {
    /* ignore */
  }
}

function stripCacheBustParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_v")) return;
    url.searchParams.delete("_v");
    const next =
      url.pathname +
      (url.searchParams.toString() ? `?${url.searchParams}` : "") +
      url.hash;
    window.history.replaceState(null, "", next);
  } catch {
    /* ignore */
  }
}

/**
 * Hard navigation that bypasses a cached document shell so new chunk hashes load.
 * Soft location.reload() often reuses the stale HTML and loops the error screen.
 */
export function hardReloadToLatest(force = false): boolean {
  if (typeof window === "undefined") return false;
  if (!force) {
    // One auto reload per tab session — clearing the cooldown after 2.5s used
    // to restart the loop while the error screen was still up.
    if (alreadyAutoRecoveredThisSession() || recentlyReloadedForChunk()) {
      return false;
    }
  }
  markReloaded(!force);
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

/** Hard-reload once to pick up the latest deployment assets. */
export function recoverFromChunkLoadError(error?: unknown): boolean {
  if (error != null && !isChunkLoadError(error)) return false;
  return hardReloadToLatest(false);
}

/**
 * Listen for Vite preload failures and recover with a single reload.
 * Safe to call from the browser root (idempotent enough for SPA mounts).
 */
export function installChunkLoadRecovery() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __pmoChunkRecoveryInstalled?: boolean };
  if (w.__pmoChunkRecoveryInstalled) return;
  w.__pmoChunkRecoveryInstalled = true;

  window.addEventListener("vite:preloadError", (event) => {
    // If we already auto-recovered this tab, do not reload again.
    if (alreadyAutoRecoveredThisSession() || recentlyReloadedForChunk()) {
      event.preventDefault();
      return;
    }
    const payload = (event as Event & { payload?: unknown }).payload;
    if (recoverFromChunkLoadError(payload ?? new Error("vite:preloadError"))) {
      event.preventDefault();
    }
  });

  // Strip cache-bust param after a healthy boot. Do NOT clear the session
  // auto-recovered flag — that is what stops refresh loops.
  window.setTimeout(() => {
    stripCacheBustParam();
  }, 4000);
}
