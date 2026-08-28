export type TurnstileWidgetSize = "normal" | "compact";

/** Standard desktop / laptop checkbox. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;
export const TURNSTILE_NORMAL_HEIGHT_PX = 65;

/** Official compact footprint — the square box that paints on phones. */
export const TURNSTILE_COMPACT_WIDTH_PX = 150;
export const TURNSTILE_COMPACT_HEIGHT_PX = 140;

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
 * True for real phone / tablet browsers (including iPhone Chrome/Firefox,
 * Android, and iOS “desktop site” which still reports as iOS/WebKit).
 */
export function isPhoneBrowser(input: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  viewportPx?: number;
}): boolean {
  const ua = input.userAgent || "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  if (/Android/i.test(ua)) return true;
  if (input.platform === "MacIntel" && (input.maxTouchPoints || 0) > 1) return true;
  const width = input.viewportPx || 0;
  return width > 0 && width <= TURNSTILE_MOBILE_MAX_PX;
}

/** Phone: square compact. Desktop / laptop: rectangle. */
export function turnstileSizeForDevice(isPhone: boolean): TurnstileWidgetSize {
  return isPhone ? "compact" : "normal";
}

/** @deprecated Prefer turnstileSizeForDevice — kept for tests. */
export function turnstileSizeForViewport(viewportPx: number): TurnstileWidgetSize {
  return turnstileSizeForDevice(isPhoneBrowser({ viewportPx }));
}
