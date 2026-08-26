export type TurnstileWidgetSize = "normal" | "compact";

/** Cloudflare `normal` is the standard 300×65 checkbox. `flexible` stretches into a large block. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;
export const TURNSTILE_NORMAL_HEIGHT_PX = 65;

/** Official compact footprint is 150×140 — a smaller box can fail to render. */
export const TURNSTILE_COMPACT_WIDTH_PX = 150;
export const TURNSTILE_COMPACT_HEIGHT_PX = 140;

/**
 * iOS / iPadOS WebKit (every iOS browser).
 */
export function isIosWebKit(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const ua = userAgent || "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function turnstileBoxForSize(size: TurnstileWidgetSize): {
  widthPx: number;
  heightPx: number;
} {
  return size === "compact"
    ? { widthPx: TURNSTILE_COMPACT_WIDTH_PX, heightPx: TURNSTILE_COMPACT_HEIGHT_PX }
    : { widthPx: TURNSTILE_NORMAL_WIDTH_PX, heightPx: TURNSTILE_NORMAL_HEIGHT_PX };
}

/**
 * Pick the official Turnstile size for the host card.
 *
 * Use `normal` (standard 300×65 checkbox) whenever the card can fit it —
 * including typical phones. `compact` only when the card is narrower than
 * 300px, and the host must reserve 150×140 or Cloudflare may render nothing.
 * Never `flexible` — that fills the form and looks like a large square.
 */
export function turnstileSizeForHost(
  containerPx: number,
  viewportPx: number,
  _iosWebKit = false,
): TurnstileWidgetSize {
  const width = containerPx > 0 ? containerPx : viewportPx > 0 ? viewportPx : 0;
  return width > 0 && width < TURNSTILE_NORMAL_WIDTH_PX ? "compact" : "normal";
}

/** @deprecated Prefer turnstileSizeForHost — kept for existing imports. */
export function turnstileSizeForWidth(widthPx: number): TurnstileWidgetSize {
  return turnstileSizeForHost(widthPx, widthPx);
}

/**
 * Prefer the card so padding can select compact; viewport is a fallback
 * when the card has not laid out yet.
 */
export function turnstileHostWidth(containerPx: number, viewportPx: number): number {
  if (containerPx > 0) return containerPx;
  return viewportPx > 0 ? viewportPx : 0;
}
