export type TurnstileWidgetSize = "normal" | "compact";

/** Cloudflare `normal` is the standard 300×65 checkbox. `flexible` stretches into a large block. */
export const TURNSTILE_NORMAL_WIDTH_PX = 300;
export const TURNSTILE_NORMAL_HEIGHT_PX = 65;

/** Official compact footprint is 150×140 — a smaller box can fail to render. */
export const TURNSTILE_COMPACT_WIDTH_PX = 150;
export const TURNSTILE_COMPACT_HEIGHT_PX = 140;

/**
 * iOS / iPadOS WebKit (Safari, Chrome, Firefox — all use WebKit on iOS).
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
 * Stock Mobile Safari only. Chrome/Firefox/Edge in-app browsers and the
 * home-screen PWA are excluded.
 */
export function isIosSafariBrowser(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
  standalone = false,
): boolean {
  if (standalone) return false;
  const ua = userAgent || "";
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|GSA\//.test(ua)) return false;
  return isIosWebKit(ua, platform, maxTouchPoints);
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
 * Typical phones (390px viewport, 16px page padding, 16px card padding) still
 * have ≥300px — use the same 300×65 checkbox that already works in Chrome
 * in-app. Compact only when the card is actually narrower than 300px.
 * Never `flexible` (it can expand into a large square).
 *
 * Do not special-case Mobile Safari to compact: that path painted an empty
 * box while Chrome on the same phone showed the checkbox.
 */
export function turnstileSizeForHost(
  containerPx: number,
  viewportPx: number,
  _iosSafari = false,
): TurnstileWidgetSize {
  const width = containerPx > 0 ? containerPx : viewportPx > 0 ? viewportPx : 0;
  return width > 0 && width < TURNSTILE_NORMAL_WIDTH_PX ? "compact" : "normal";
}

/**
 * Login always uses the 300×65 checkbox. Compact (150×140) is what painted the
 * empty gray tombstone on Mobile Safari in production.
 */
export function turnstileAuthWidgetSize(): TurnstileWidgetSize {
  return "normal";
}

/**
 * True when Cloudflare has injected its challenge iframe.
 * Use querySelector — Mobile Safari's innerHTML is often empty for a live
 * cross-origin iframe, which made login sit on “Loading Cloudflare check…”.
 */
export function turnstileHostHasWidget(
  host: { querySelector?: (sel: string) => unknown } | null | undefined,
): boolean {
  return Boolean(host?.querySelector?.("iframe"));
}

/** Do not remount if render already returned an id or the iframe is in the DOM. */
export function turnstileShouldRemount(options: {
  widgetId: string | null | undefined;
  hasIframe: boolean;
}): boolean {
  if (options.widgetId) return false;
  if (options.hasIframe) return false;
  return true;
}

/**
 * Stable empty innerHTML so React will not reset the host on parent re-renders.
 * Without this, login (brand fetch, session, typing) re-renders the empty div
 * and React deletes Cloudflare’s iframe — the checkbox never stays on mobile.
 */
export const TURNSTILE_HOST_INNER_HTML = { __html: "" };

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
