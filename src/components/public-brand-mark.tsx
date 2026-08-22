import {
  resolveBrandLogoDims,
  type LandingConfig,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { PUBLIC_LANDING_LOGO_HREF } from "@/lib/live-landing-logo";

type PublicBrandMarkProps = {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
  /**
   * Repeat-visit https CDN URL from the landing-logo cookie. When omitted,
   * the same-origin API href is used so first HTML and hydrate match.
   */
  src?: string;
};

/**
 * Uploaded Landing-config mark. Src is always the live logo endpoint so the
 * first HTML and the hydrated page request the same file — never a diamond
 * fallback, never a packaged→uploaded swap.
 */
export function PublicBrandMark({
  cfg,
  size,
  src,
}: PublicBrandMarkProps) {
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const heightPx = size === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx;
  const maxWidthPx = size === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx;

  return (
    <img
      src={src || PUBLIC_LANDING_LOGO_HREF}
      alt={cfg.brand.name || "iProjectX"}
      height={heightPx}
      width={maxWidthPx}
      className="w-auto object-contain"
      style={{ height: heightPx, maxWidth: maxWidthPx, width: "auto" }}
      fetchPriority="high"
      decoding="async"
      draggable={false}
    />
  );
}
