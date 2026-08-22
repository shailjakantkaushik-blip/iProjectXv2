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
};

/**
 * Marketing chrome brand mark. Src is always the live logo endpoint so the
 * first HTML and the hydrated page request the same file — no packaged→current
 * flicker when Landing-config arrives.
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

  return (
    <img
      src={PUBLIC_LANDING_LOGO_HREF}
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
