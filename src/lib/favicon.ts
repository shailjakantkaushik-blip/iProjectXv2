import {
  LANDING_CONFIG_CACHE_KEY,
  resolveBrandLogoUrl,
  type LandingConfig,
} from "@/lib/landing-config";

/** Default tab icon when no custom auth logo is configured. */
export const DEFAULT_FAVICON_HREF = "/favicon.png";

const ICON_LINK_ID = "pmo-favicon";
const APPLE_LINK_ID = "pmo-apple-touch-icon";

function ensureLink(id: string, rel: string, type?: string): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.id = id;
    el.rel = rel;
    if (type) el.type = type;
    document.head.appendChild(el);
  }
  return el;
}

/** Resolve favicon href — same source as the login / auth brand mark. */
export function resolveFaviconHref(cfg: LandingConfig | null | undefined): string {
  if (!cfg?.brand) return DEFAULT_FAVICON_HREF;
  const authLogo = resolveBrandLogoUrl(cfg.brand, "auth");
  return authLogo || DEFAULT_FAVICON_HREF;
}

/** Apply favicon (+ apple-touch) to the document head. */
export function applyFaviconHref(href: string) {
  if (typeof document === "undefined") return;
  const url = (href || DEFAULT_FAVICON_HREF).trim() || DEFAULT_FAVICON_HREF;
  const isData = url.startsWith("data:");
  const isPng = !isData && /\.png(\?|$)/i.test(url);
  const isIco = !isData && /\.ico(\?|$)/i.test(url);
  const isSvg = !isData && /\.svg(\?|$)/i.test(url);
  const isWebp = !isData && /\.webp(\?|$)/i.test(url);

  const type = isData
    ? undefined
    : isIco
      ? "image/x-icon"
      : isSvg
        ? "image/svg+xml"
        : isWebp
          ? "image/webp"
          : isPng
            ? "image/png"
            : undefined;

  const icon = ensureLink(ICON_LINK_ID, "icon", type);
  if (icon && icon.href !== url) {
    if (type) icon.type = type;
    else icon.removeAttribute("type");
    icon.href = url;
  }

  // Apple touch prefers a raster; skip huge data URLs for touch icon only if very large.
  const appleHref =
    isData && url.length > 180_000 ? DEFAULT_FAVICON_HREF : url.startsWith("data:") ? url : url;
  const apple = ensureLink(APPLE_LINK_ID, "apple-touch-icon");
  if (apple && apple.getAttribute("href") !== appleHref) {
    apple.href = appleHref;
  }
}

export function applyFaviconFromLandingConfig(cfg: LandingConfig | null | undefined) {
  applyFaviconHref(resolveFaviconHref(cfg));
}

/**
 * Early boot: set tab icon from cached landing config (auth logo) before React.
 * Injected as an inline script in the document shell.
 */
export function getFaviconBootScript(): string {
  return `(function(){try{var F=${JSON.stringify(DEFAULT_FAVICON_HREF)};var href=F;var raw=localStorage.getItem(${JSON.stringify(LANDING_CONFIG_CACHE_KEY)});if(raw){var cfg=JSON.parse(raw);var b=cfg&&cfg.brand;if(b){var u=(b.logo_url_auth||b.logo_url||"").trim();if(u)href=u;}}var id=${JSON.stringify(ICON_LINK_ID)};var el=document.getElementById(id);if(!el){el=document.createElement("link");el.id=id;el.rel="icon";document.head.appendChild(el);}el.href=href;var a=document.getElementById(${JSON.stringify(APPLE_LINK_ID)});if(!a){a=document.createElement("link");a.id=${JSON.stringify(APPLE_LINK_ID)};a.rel="apple-touch-icon";document.head.appendChild(a);}a.href=href.length>180000&&href.indexOf("data:")===0?F:href;}catch(e){}})();`;
}
