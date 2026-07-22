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
 * Applies the organisation colour palette on /app and /platform routes.
 * Keeping both shells on the same palette avoids a colour “jump” when opening
 * Platform → Settings. Org theme wins over platform when enabled.
 */
export function OrgThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inThemedShell =
    pathname.startsWith("/app") || pathname.startsWith("/platform");

  useLayoutEffect(() => {
    if (!inThemedShell || !organization) {
      // Auth / marketing stay on platform (or default) theme.
      if (!inThemedShell) clearOrgThemeFromDocument();
      return;
    }

    const theme = resolveOrgColorTheme(organization);
    if (theme?.enabled) {
      writeCachedOrgTheme(organization.id, theme);
      applyOrgThemeToDocument(theme);
    } else {
      clearOrgThemeFromDocument();
    }
  }, [inThemedShell, organization]);

  useEffect(() => {
    const onChange = (e: Event) => {
      if (!inThemedShell) return;
      const detail = (e as CustomEvent<{ orgId: string; theme: OrgColorTheme }>).detail;
      if (!detail?.theme) return;
      if (organization && detail.orgId !== organization.id) return;
      applyOrgThemeToDocument(detail.theme);
    };
    window.addEventListener(ORG_THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(ORG_THEME_CHANGE_EVENT, onChange);
  }, [inThemedShell, organization]);

  return <>{children}</>;
}
