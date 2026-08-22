import { StableBrandLogo } from "@/components/stable-brand-logo";
import {
  resolveBrandLogoDims,
  type LandingConfig,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { resolvePublicLandingLogoUrl } from "@/lib/public-landing-logo";
import { PACKAGED_PUBLIC_MARK_HREF } from "@/lib/live-landing-logo";

type PublicBrandMarkProps = {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
};

/**
 * Marketing chrome brand mark. Uses the Landing-config file and size the
 * same way as before this week's API experiment — never a 32px default once
 * live/cached config is on the page.
 */
export function PublicBrandMark({
  cfg,
  size,
}: PublicBrandMarkProps) {
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const heightPx = size === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx;
  const maxWidthPx = size === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx;
  const configured = resolvePublicLandingLogoUrl(cfg.brand);
  const src = configured || PACKAGED_PUBLIC_MARK_HREF;

  return (
    <StableBrandLogo
      src={src}
      alt={cfg.brand.name || "iProjectX"}
      heightPx={heightPx}
      maxWidthPx={maxWidthPx}
    />
  );
}
