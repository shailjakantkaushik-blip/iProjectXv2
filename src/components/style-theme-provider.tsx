import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLandingConfig,
  readCachedLandingConfig,
} from "@/lib/landing-config";
import {
  applyStyleThemeToDocument,
  normalizeOrgStyleTheme,
  readCachedOrgStyleTheme,
  readUserStyleTheme,
  resolveStyleThemeId,
  writeCachedOrgStyleTheme,
  STYLE_THEME_CHANGE_EVENT,
  type StyleThemeId,
} from "@/lib/style-theme";

/**
 * Keeps data-style-theme in sync with platform / org / user resolution.
 * Boot script paints first; this reconciles after auth + config hydrate.
 */
export function StyleThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useAuth();
  const cachedLanding = useMemo(() => readCachedLandingConfig(), []);
  const { data: landing } = useQuery({
    queryKey: ["landing-config"],
    queryFn: fetchLandingConfig,
    staleTime: 60_000,
    initialData: cachedLanding ?? undefined,
  });

  const orgCfg = useMemo(() => {
    if (!organization?.id) return readCachedOrgStyleTheme();
    const fromUi = normalizeOrgStyleTheme(organization.ui_config?.style_theme);
    writeCachedOrgStyleTheme(organization.id, fromUi);
    return fromUi;
  }, [organization?.id, organization?.ui_config?.style_theme]);

  const themeId = useMemo(() => {
    const user = readUserStyleTheme(organization?.id);
    return resolveStyleThemeId({
      platformThemeId: landing?.style_theme_id ?? cachedLanding?.style_theme_id,
      orgConfig: orgCfg,
      userThemeId: user,
    });
  }, [
    landing?.style_theme_id,
    cachedLanding?.style_theme_id,
    orgCfg,
    organization?.id,
    organization?.ui_config?.style_theme,
  ]);

  useEffect(() => {
    applyStyleThemeToDocument(themeId);
  }, [themeId]);

  useEffect(() => {
    const onChange = () => {
      const user = readUserStyleTheme(organization?.id);
      const next = resolveStyleThemeId({
        platformThemeId: landing?.style_theme_id ?? cachedLanding?.style_theme_id,
        orgConfig: orgCfg,
        userThemeId: user,
      });
      applyStyleThemeToDocument(next as StyleThemeId);
    };
    window.addEventListener(STYLE_THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(STYLE_THEME_CHANGE_EVENT, onChange);
  }, [organization?.id, landing?.style_theme_id, cachedLanding?.style_theme_id, orgCfg]);

  return <>{children}</>;
}
