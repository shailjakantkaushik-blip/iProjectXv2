import {
  resolveBrandLogoDims,
  type LandingConfig,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { resolvePublicLandingLogoUrl } from "@/lib/public-landing-logo";
import { visiblePublicLogoUrl } from "@/lib/live-landing-logo";

type PublicBrandMarkProps = {
  cfg: LandingConfig;
  /** Override; defaults to configured landing logo size. */
  size?: LogoDisplaySize;
  onDark?: boolean;
};

/**
 * Marketing chrome brand mark. Uses the Landing-config file when the client
 * has it; otherwise the packaged iProjectX mark so the first HTML is never a
 * broken / 404 image.
 */
export function PublicBrandMark({
  cfg,
  size,
}: PublicBrandMarkProps) {
  const token = size ?? cfg.brand.logo_size_landing ?? "md";
  const dims =
    size != null
      ? resolveBrandLogoDims({ ...cfg.brand, logo_size_landing: size }, "landing")
      : resolveBrandLogoDims(cfg.brand, "landing");
  const heightPx = token === "sm" ? Math.min(24, dims.heightPx) : dims.heightPx;
  const maxWidthPx = token === "sm" ? Math.min(120, dims.maxWidthPx) : dims.maxWidthPx;
  const src = visiblePublicLogoUrl(resolvePublicLandingLogoUrl(cfg.brand));

  return (
    <img
      src={src}
      alt={cfg.brand.name || "iProjectX"}
      width={maxWidthPx}
      height={heightPx}
      fetchPriority="high"
      decoding="async"
      className="w-auto object-contain"
      style={{ height: heightPx, maxWidth: maxWidthPx }}
    />
  );
}
