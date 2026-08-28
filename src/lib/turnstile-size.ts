export type TurnstileWidgetSize = "normal" | "compact";

/** Cloudflare `normal` is the standard 300×65 checkbox. `flexible` stretches into a large block. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;

/**
 * Prefer the viewport so card padding does not force the square compact widget
 * on typical phones. The 300×65 checkbox still fits a 320px screen.
 */
export function turnstileHostWidth(containerPx: number, viewportPx: number): number {
  const host = containerPx > 0 ? containerPx : 0;
  const viewport = viewportPx > 0 ? viewportPx : 0;
  return Math.max(host, viewport);
}

/**
 * Pick the official Turnstile size for the host card.
 * Use `normal` (standard login widget) whenever it fits; `compact` only on
 * very narrow phones so the iframe is not clipped. Never `flexible` — that
 * fills the form and looks like a large square.
 */
export function turnstileSizeForWidth(widthPx: number): TurnstileWidgetSize {
  return widthPx > 0 && widthPx < TURNSTILE_NORMAL_WIDTH_PX ? "compact" : "normal";
}
