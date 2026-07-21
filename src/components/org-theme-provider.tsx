import { useLayoutEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  ORG_THEME_CHANGE_EVENT,
  applyOrgThemeToDocument,
  clearOrgThemeFromDocument,
  resolveOrgColorTheme,
  writeCachedOrgTheme,
  type OrgColorTheme,
} from "@/lib/org-theme";
import { useEffect } from "react";

/**
 * Applies the organisation colour palette on /app routes.
 * Org theme always wins over platform when enabled (or legacy primary/accent set).
 * useLayoutEffect keeps the transition seamless (no flash of platform colours).
 */
export function OrgThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isApp = pathname.startsWith("/app");

  useLayoutEffect(() => {
    if (!isApp || !organization) {
      // Keep cached style on non-app routes only if leaving app briefly —
      // clear when not in /app so platform/auth stay platform-themed.
      if (!isApp) clearOrgThemeFromDocument();
      return;
    }

    const theme = resolveOrgColorTheme(organization);
    if (theme?.enabled) {
      writeCachedOrgTheme(organization.id, theme);
      applyOrgThemeToDocument(theme);
    } else {
      clearOrgThemeFromDocument();
    }
  }, [isApp, organization]);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (!isApp) return;
      const detail = (e as CustomEvent<{ orgId: string; theme: OrgColorTheme }>).detail;
      if (!detail?.theme) return;
      if (organization && detail.orgId !== organization.id) return;
      applyOrgThemeToDocument(detail.theme);
    };
    window.addEventListener(ORG_THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ORG_THEME_CHANGE_EVENT, onChange);
  }, [isApp, organization]);

  return <>{children}</>;
}
