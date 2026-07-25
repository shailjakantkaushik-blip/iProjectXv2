import { useEffect } from "react";
import {
  fetchLandingConfig,
  readCachedLandingConfig,
  type LandingConfig,
} from "@/lib/landing-config";
import { applyFaviconFromLandingConfig } from "@/lib/favicon";

/**
 * Keeps the browser tab icon in sync with the login / auth brand logo
 * (landing_config brand.logo_url_auth, same as the sign-in page).
 */
export function FaviconSync() {
  useEffect(() => {
    const apply = (cfg: LandingConfig | null) => {
      applyFaviconFromLandingConfig(cfg);
    };

    apply(readCachedLandingConfig());

    let cancelled = false;
    fetchLandingConfig()
      .then((cfg) => {
        if (!cancelled) apply(cfg);
      })
      .catch(() => {});

    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<LandingConfig>).detail;
      if (detail) apply(detail);
      else {
        fetchLandingConfig()
          .then((cfg) => {
            if (!cancelled) apply(cfg);
          })
          .catch(() => {});
      }
    };
    window.addEventListener("pmo:platform-theme-change", onTheme);
    return () => {
      cancelled = true;
      window.removeEventListener("pmo:platform-theme-change", onTheme);
    };
  }, []);

  return null;
}
