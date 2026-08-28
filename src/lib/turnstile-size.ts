export type TurnstileWidgetSize = "normal" | "compact";

/** Standard desktop / laptop checkbox. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;
export const TURNSTILE_NORMAL_HEIGHT_PX = 65;

/** Official compact footprint — this is the square box that paints on phones. */
export const TURNSTILE_COMPACT_WIDTH_PX = 150;
export const TURNSTILE_COMPACT_HEIGHT_PX = 140;

/** Phones and small portrait tablets. Laptops stay on the rectangle. */
export const TURNSTILE_MOBILE_MAX_PX = 767;

export function turnstileBoxForSize(size: TurnstileWidgetSize): {
  widthPx: number;
  heightPx: number;
} {
  return size === "compact"
    ? { widthPx: TURNSTILE_COMPACT_WIDTH_PX, heightPx: TURNSTILE_COMPACT_HEIGHT_PX }
    : { widthPx: TURNSTILE_NORMAL_WIDTH_PX, heightPx: TURNSTILE_NORMAL_HEIGHT_PX };
}

/**
 * Mobile: compact (square 150×140) — that is the widget that recently showed
 * on phones. Desktop / laptop: normal (rectangle 300×65).
 */
export function turnstileSizeForViewport(viewportPx: number): TurnstileWidgetSize {
  return viewportPx > 0 && viewportPx <= TURNSTILE_MOBILE_MAX_PX ? "compact" : "normal";
}
