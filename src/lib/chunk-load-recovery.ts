const RELOAD_KEY = "pmo:chunk-reload";
const RELOAD_COOLDOWN_MS = 30_000;

/** True when a Vite/browser dynamic import failed (usually after a new deploy). */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String((error as { message?: unknown } | null)?.message ?? error ?? "");

  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message)
  );
}

function recentlyReloaded(): boolean {
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

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Hard-reload once to pick up the latest deployment assets. */
export function recoverFromChunkLoadError(error?: unknown): boolean {
  if (error != null && !isChunkLoadError(error)) return false;
  if (typeof window === "undefined") return false;
  if (recentlyReloaded()) return false;
  markReloaded();
  window.location.reload();
  return true;
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
    const payload = (event as Event & { payload?: unknown }).payload;
    if (recoverFromChunkLoadError(payload ?? new Error("vite:preloadError"))) {
      event.preventDefault();
    }
  });
}
