import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DEFAULT_LANDING,
  fetchLandingConfig,
  readCachedLandingConfigForPaint,
  type LandingConfig,
} from "@/lib/landing-config";
import {
  applyPlatformThemeToDocument,
  clearPlatformThemeFromDocument,
} from "@/lib/platform-theme";

/**
 * Applies the platform Landing/theme palette to login and authenticated app
 * pages when those scopes are enabled in Landing Page Configuration.
 * Landing marketing page keeps its own scoped --lp-* styling.
 */
export function PlatformThemeProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [cfg, setCfg] = useState<LandingConfig>(
    () => readCachedLandingConfigForPaint() ?? DEFAULT_LANDING,
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchLandingConfig()
        .then((c) => {
          if (!cancelled) setCfg(c);
        })
        .catch(() => {});
    };
    load();
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<LandingConfig>).detail;
      if (detail) setCfg(detail);
      else load();
    };
    window.addEventListener("pmo:platform-theme-change", onTheme);
    return () => {
      cancelled = true;
      window.removeEventListener("pmo:platform-theme-change", onTheme);
    };
  }, [pathname]);

  // useLayoutEffect applies before paint — avoids a frame of default colours.
  useLayoutEffect(() => {
    const isLanding = pathname === "/";
    const isAuth =
      pathname === "/auth" ||
      pathname === "/reset-password" ||
      pathname === "/force-password-change";
    const isApp = pathname.startsWith("/app") || pathname.startsWith("/platform");

    if (isLanding) {
      clearPlatformThemeFromDocument();
      return;
    }

    applyPlatformThemeToDocument(cfg, { forAuth: isAuth, forApp: isApp });
  }, [cfg, pathname]);

  return <>{children}</>;
}
