import { StableBrandLogo } from "@/components/stable-brand-logo";
import {
  resolveBrandLogoDims,
  resolveBrandLogoUrl,
  type LandingConfig,
  type LogoDisplaySize,
} from "@/lib/landing-config";

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };

type PublicBrandMarkProps = {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
};

/**
 * Pre-video-ads brand mark: Landing-config file at the configured size.
 * Uses `resolveBrandLogoUrl(..., "landing")` so the uploaded Landing / legacy
 * file paints — same as before the film work.
 */
export function PublicBrandMark({
  cfg,
  size,
  onDark = false,
}: PublicBrandMarkProps) {
  const p = cfg.palette;
  const token = size ?? cfg.brand.logo_size_landing ?? "md";
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const logoUrl = resolveBrandLogoUrl(cfg.brand, "landing");
  const box =
    token === "xl" || (token === "custom" && dims.heightPx >= 48)
      ? "h-12 w-12"
      : token === "lg" || (token === "custom" && dims.heightPx >= 36)
        ? "h-11 w-11"
        : token === "sm" || (token === "custom" && dims.heightPx <= 24)
          ? "h-7 w-7"
          : "h-8 w-8";
  const diamond =
    token === "xl" || token === "lg" || dims.heightPx >= 36
      ? "h-5 w-5"
      : token === "sm" || dims.heightPx <= 24
        ? "h-3 w-3"
        : "h-4 w-4";
  const text =
    token === "xl" || dims.heightPx >= 52
      ? "text-3xl"
      : token === "lg" || dims.heightPx >= 40
        ? "text-2xl"
        : token === "sm" || dims.heightPx <= 24
          ? "text-base"
          : "text-xl";

  if (logoUrl) {
    return (
      <StableBrandLogo
        src={logoUrl}
        alt={cfg.brand.name}
        heightPx={size === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx}
        maxWidthPx={size === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`flex ${box} items-center justify-center rounded-md`}
        style={{ background: onDark ? "rgba(255,255,255,0.12)" : p.navy }}
      >
        <span className={`${diamond} rotate-45 border-2`} style={{ borderColor: p.accent }} />
      </span>
      <span
        className={`${text} font-bold tracking-tight`}
        style={{ ...HEADING, color: onDark ? p.textOnDark : p.textHeading }}
      >
        {cfg.brand.name}
      </span>
    </span>
  );
}
