import { StableBrandLogo } from "@/components/stable-brand-logo";
import {
  resolveBrandLogoDims,
  sanitizeEmbeddedAssetUrl,
  type LandingConfig,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { resolvePublicLandingLogoUrl } from "@/lib/public-landing-logo";

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };

type PublicBrandMarkProps = {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
  /**
   * `slot` — reserved space only (public landing: never the diamond placeholder).
   * `name` — wordmark if the logo URL is not ready.
   */
  fallback?: "slot" | "name";
};

/**
 * Marketing chrome brand mark. Paints the configured landing logo. Never the
 * App-shell file and never the geometric diamond placeholder.
 */
export function PublicBrandMark({
  cfg,
  size,
  onDark = false,
  fallback = "slot",
}: PublicBrandMarkProps) {
  const p = cfg.palette;
  const token = size ?? cfg.brand.logo_size_landing ?? "md";
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const logoUrl = sanitizeEmbeddedAssetUrl(resolvePublicLandingLogoUrl(cfg.brand));
  const text =
    token === "xl" || dims.heightPx >= 52
      ? "text-3xl"
      : token === "lg" || dims.heightPx >= 40
        ? "text-2xl"
        : token === "sm" || dims.heightPx <= 24
          ? "text-base"
          : "text-xl";
  const heightPx = size === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx;
  const maxWidthPx = size === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx;

  if (logoUrl) {
    return (
      <StableBrandLogo
        src={logoUrl}
        alt={cfg.brand.name}
        heightPx={heightPx}
        maxWidthPx={maxWidthPx}
      />
    );
  }

  if (fallback === "name") {
    return (
      <span
        className={`${text} font-bold tracking-tight`}
        style={{ ...HEADING, color: onDark ? p.textOnDark : p.textHeading }}
      >
        {cfg.brand.name}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      data-landing-brand-slot
      className="inline-block"
      style={{ height: heightPx, width: Math.min(maxWidthPx, heightPx * 2.5) }}
    />
  );
}
