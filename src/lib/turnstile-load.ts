export const TURNSTILE_SCRIPT_HINT = "challenges.cloudflare.com/turnstile/v0/api.js";

export const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function isTurnstileScriptSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.includes(TURNSTILE_SCRIPT_HINT);
}

/**
 * WebKit (every iPhone browser) often never fires `load` again after
 * `<link rel="preload" as="script">` of the same URL. Always poll for
 * `window.turnstile` instead of waiting on onload.
 */
export function turnstileShouldPollApi(): boolean {
  return true;
}

export function findTurnstileScript(
  scripts: Array<{ getAttribute?: (name: string) => string | null; src?: string }>,
): boolean {
  return scripts.some((el) =>
    isTurnstileScriptSrc(el.getAttribute?.("src") || el.src || ""),
  );
}
