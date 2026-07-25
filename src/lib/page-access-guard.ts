import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ADMIN_ONLY_PAGES, PAGES, useAllowedPages } from "@/lib/permissions";

/** Paths that participate in the org page ACL matrix (or admin-only set). */
export function isAclProtectedPath(pathname: string): boolean {
  if (ADMIN_ONLY_PAGES.has(pathname)) return true;
  return PAGES.some((p) => p.path === pathname);
}

/**
 * Redirect away from pages the current role cannot view.
 * Complements nav filtering so direct URLs cannot bypass page ACL.
 */
export function usePageAccessGuard() {
  const { canView, isReady } = useAllowedPages();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isReady) return;
    if (!isAclProtectedPath(pathname)) return;
    if (canView(pathname)) return;
    navigate({ to: "/app", replace: true });
  }, [isReady, canView, pathname, navigate]);
}
