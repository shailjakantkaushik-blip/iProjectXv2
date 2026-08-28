export const TURNSTILE_TOKEN_STORAGE_KEY = "iprojectx.turnstile.token";
export const TURNSTILE_TOKEN_EVENT = "iprojectx-turnstile-token";
export const TURNSTILE_TOKEN_INPUT_ID = "turnstile-token-bridge";

export function readTurnstileTokenFromBridge(): string | null {
  if (typeof document !== "undefined") {
    const input = document.getElementById(TURNSTILE_TOKEN_INPUT_ID) as HTMLInputElement | null;
    if (input?.value) return input.value;
  }
  try {
    const fromSession = sessionStorage.getItem(TURNSTILE_TOKEN_STORAGE_KEY);
    if (fromSession) return fromSession;
  } catch {
    /* private mode */
  }
  try {
    const fromLocal = localStorage.getItem(TURNSTILE_TOKEN_STORAGE_KEY);
    if (fromLocal) return fromLocal;
  } catch {
    /* private mode */
  }
  return null;
}

export function clearTurnstileTokenBridge(): void {
  if (typeof document !== "undefined") {
    const input = document.getElementById(TURNSTILE_TOKEN_INPUT_ID) as HTMLInputElement | null;
    if (input) input.value = "";
  }
  try {
    sessionStorage.removeItem(TURNSTILE_TOKEN_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  try {
    localStorage.removeItem(TURNSTILE_TOKEN_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
