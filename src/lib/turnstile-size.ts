export type TurnstileWidgetSize = "normal" | "compact";

/** Cloudflare `normal` is the standard 300×65 checkbox. `flexible` stretches into a large block. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;

/** Tailwind `sm` — phones and large phones, including iPhone Pro Max (~430). */
export const TURNSTILE_PHONE_VIEWPORT_PX = 640;

/**
 * iOS / iPadOS WebKit (every iOS browser). Used to force the compact widget so
 * the interactive challenge is not clipped by Mobile Safari.
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

/**
 * Pick the official Turnstile size for the host card.
 *
 * Phones and iOS Safari use `compact` (130×120). The 300×65 `normal` widget
 * plus Cloudflare's follow-up challenge is clipped by Mobile Safari when the
 * page uses overflow-x clipping. Never `flexible` — that fills the form and
 * looks like a large square.
 */
export function turnstileSizeForHost(
  containerPx: number,
  viewportPx: number,
  iosWebKit = false,
): TurnstileWidgetSize {
  if (iosWebKit) return "compact";
  if (viewportPx > 0 && viewportPx < TURNSTILE_PHONE_VIEWPORT_PX) return "compact";
  if (containerPx > 0 && containerPx < TURNSTILE_NORMAL_WIDTH_PX) return "compact";
  return "normal";
}

/** @deprecated Prefer turnstileSizeForHost — kept for existing imports. */
export function turnstileSizeForWidth(widthPx: number): TurnstileWidgetSize {
  return turnstileSizeForHost(widthPx, widthPx);
}

/**
 * Host width used only when we still need a single number (tests / callers).
 * Prefer the actual card so padding can select compact; viewport is a fallback
 * when the card has not laid out yet.
 */
export function turnstileHostWidth(containerPx: number, viewportPx: number): number {
  if (containerPx > 0) return containerPx;
  return viewportPx > 0 ? viewportPx : 0;
}
