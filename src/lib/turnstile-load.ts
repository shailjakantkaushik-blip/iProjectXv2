/**
 * Script-load helpers for Cloudflare Turnstile.
 *
 * The auth HTML starts `api.js?render=explicit` during parse. On Mobile Safari
 * that `load` event often fires before React hydrates. Waiting on it again
 * hangs forever — `window.turnstile` never arrives from our point of view and
 * the checkbox never mounts.
 */

export const TURNSTILE_SCRIPT_HINT = "challenges.cloudflare.com/turnstile/v0/api.js";

export function isTurnstileScriptSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.includes(TURNSTILE_SCRIPT_HINT);
}

/**
 * True when we must poll for `window.turnstile` instead of waiting for
 * `script.onload`. Once the parser has already run the tag, `load` will not
 * fire again (Safari classic scripts also omit `readyState`).
 */
export function turnstileMustPollApi(options: {
  turnstilePresent: boolean;
  scriptAlreadyInDocument: boolean;
}): boolean {
  if (options.turnstilePresent) return false;
  return options.scriptAlreadyInDocument;
}
