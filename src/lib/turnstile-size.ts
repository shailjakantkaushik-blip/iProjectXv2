export type TurnstileWidgetSize = "normal" | "compact";

/** Official Cloudflare checkbox — used on desktop, web app, and phone browsers. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;
export const TURNSTILE_NORMAL_HEIGHT_PX = 65;

export const TURNSTILE_COMPACT_WIDTH_PX = 150;
export const TURNSTILE_COMPACT_HEIGHT_PX = 140;

export function turnstileBoxForSize(size: TurnstileWidgetSize): {
  widthPx: number;
  heightPx: number;
} {
  return size === "compact"
    ? { widthPx: TURNSTILE_COMPACT_WIDTH_PX, heightPx: TURNSTILE_COMPACT_HEIGHT_PX }
    : { widthPx: TURNSTILE_NORMAL_WIDTH_PX, heightPx: TURNSTILE_NORMAL_HEIGHT_PX };
}

/** Login always uses the standard rectangle. */
export function turnstileAuthWidgetSize(): TurnstileWidgetSize {
  return "normal";
}
