/**
 * Per-page "Download page" (PDF/PPT/PNG) allow/deny.
 *
 * Storage (no new columns — follows existing JSON config patterns):
 * - Platform defaults: landing_config.config.page_download
 * - Org override: organizations.ui_config.page_download
 *
 * Resolution: org page key → platform page key → default allow (for catalog pages).
 * Platform admin routes and Org Admin / settings tools are never downloadable.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { APP_NAV_GROUPS } from "@/lib/navigation-config";
import { fetchLandingConfig, readCachedLandingConfig } from "@/lib/landing-config";

export type PageDownloadConfig = {
  /** path → enabled. Omitted keys inherit the next layer / default. */
  pages?: Record<string, boolean>;
};

/** Paths that must never show page download (admin tools, chat, special exporters). */
const NEVER_DOWNLOAD = new Set<string>([
  "/app/configuration",
  "/app/navigation",
  "/app/project-access",
  "/app/project-purge",
  "/app/billing",
  "/app/licenses",
  "/app/team",
  "/app/permissions",
  "/app/settings",
  "/app/business-units",
  "/app/stage-gate-config",
  "/app/chart-theme",
  "/app/data-editor",
  "/app/page-downloads",
  "/app/ai-assist",
  "/app/support",
  "/app/about",
  "/app/legal",
  "/app/project-infographic",
  "/app/projects/new",
]);

export type PageDownloadCatalogItem = {
  path: string;
  label: string;
  group: string;
};

/** Workspace pages eligible for Download page (excludes Org Admin + never-list). */
export function pageDownloadCatalog(): PageDownloadCatalogItem[] {
  const out: PageDownloadCatalogItem[] = [];
  for (const g of APP_NAV_GROUPS) {
    if (g.heading === "Org Admin" || g.heading === "Platform" || g.heading === "Legal") {
      continue;
    }
    for (const item of g.items) {
      const path = normalizeAppPath(item.to);
      if (NEVER_DOWNLOAD.has(path)) continue;
      if (item.adminOnly || item.platformOnly) continue;
      // Home is a dashboard hub — include it
      out.push({ path, label: item.label, group: g.heading });
    }
  }
  return out;
}

export function normalizeAppPath(path: string): string {
  if (!path) return "/app";
  let p = path.split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "/app/") return "/app";
  return p;
}

export function isPageDownloadCandidate(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  if (!path.startsWith("/app")) return false;
  if (path.startsWith("/platform")) return false;
  if (NEVER_DOWNLOAD.has(path)) return false;
  // Dynamic project detail / invoices — not in catalog
  if (path.startsWith("/app/projects/") && path !== "/app/projects") return false;
  if (path.startsWith("/app/invoice/")) return false;
  return pageDownloadCatalog().some((p) => p.path === path) || path === "/app";
}

export function normalizePageDownloadConfig(
  raw: unknown,
): PageDownloadConfig {
  if (!raw || typeof raw !== "object") return { pages: {} };
  const pagesIn = (raw as PageDownloadConfig).pages;
  if (!pagesIn || typeof pagesIn !== "object") return { pages: {} };
  const pages: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(pagesIn)) {
    if (typeof v === "boolean") pages[normalizeAppPath(k)] = v;
  }
  return { pages };
}

export function defaultPageDownloadConfig(): PageDownloadConfig {
  const pages: Record<string, boolean> = {};
  for (const p of pageDownloadCatalog()) pages[p.path] = true;
  // Home
  pages["/app"] = true;
  return { pages };
}

/**
 * Resolve whether Download page is allowed for a path.
 * Org override wins; else platform default; else allow for catalog candidates.
 */
export function resolvePageDownloadAllowed(
  pathname: string,
  orgConfig?: PageDownloadConfig | null,
  platformConfig?: PageDownloadConfig | null,
): boolean {
  const path = normalizeAppPath(pathname);
  if (!isPageDownloadCandidate(path)) return false;

  const orgPages = orgConfig?.pages;
  if (orgPages && Object.prototype.hasOwnProperty.call(orgPages, path)) {
    return !!orgPages[path];
  }
  const platPages = platformConfig?.pages;
  if (platPages && Object.prototype.hasOwnProperty.call(platPages, path)) {
    return !!platPages[path];
  }
  return true;
}

export function exportFileNameForPath(pathname: string): string {
  const path = normalizeAppPath(pathname);
  if (path === "/app") return "Home";
  const slug = path.replace(/^\/app\/?/, "").replace(/\//g, "_") || "page";
  return slug
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("_");
}

export function exportTitleForPath(pathname: string): string {
  const path = normalizeAppPath(pathname);
  if (path === "/app") return "Home";
  const hit = pageDownloadCatalog().find((p) => p.path === path);
  return hit?.label ?? exportFileNameForPath(path).replace(/_/g, " ");
}

/** Org config is already on the auth organization object — no extra query. */
export function useOrgPageDownloadConfig(): PageDownloadConfig | null {
  const { organization } = useAuth();
  return useMemo(() => {
    const raw = (organization?.ui_config as { page_download?: unknown } | null | undefined)
      ?.page_download;
    return raw ? normalizePageDownloadConfig(raw) : null;
  }, [organization?.ui_config]);
}

/**
 * Platform defaults from landing_config — cached, long staleTime.
 * Skipped until needed (download check / admin UI).
 */
export function usePlatformPageDownloadConfig(enabled = true) {
  return useQuery({
    queryKey: ["landing-config", "page_download"],
    queryFn: async () => {
      const cfg = await fetchLandingConfig();
      return normalizePageDownloadConfig((cfg as { page_download?: unknown }).page_download);
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

/** Live check for the current route — used by layout Download + SectionFrame. */
export function usePageDownloadAllowed(pathname?: string): boolean {
  const livePath = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname ?? livePath;
  const candidate = isPageDownloadCandidate(path);
  const org = useOrgPageDownloadConfig();

  // Prefer sync landing cache (no network). Fetch only when cache missing.
  const cachedPlatform = useMemo(() => {
    if (typeof window === "undefined") return null;
    const cached = readCachedLandingConfig();
    if (!cached) return null;
    return normalizePageDownloadConfig(
      (cached as { page_download?: unknown }).page_download,
    );
  }, [path]);

  const needFetch = candidate && !cachedPlatform;
  const { data: fetchedPlatform } = usePlatformPageDownloadConfig(needFetch);

  return resolvePageDownloadAllowed(
    path,
    org,
    cachedPlatform ?? fetchedPlatform ?? null,
  );
}
