import { useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { DownloadMenu } from "@/components/page-export";
import {
  exportFileNameForPath,
  exportTitleForPath,
  usePageDownloadAllowed,
} from "@/lib/page-download";

/**
 * Layout wrapper: page content + bottom "Download page" when allowed.
 * Captures only Outlet content (never shell nav/header).
 */
export function AppPageDownload({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = usePageDownloadAllowed(pathname);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      <div ref={ref} data-export-root>
        {children}
      </div>
      {allowed ? (
        <div className="mt-6 flex justify-end print:hidden" data-export-hide>
          <DownloadMenu
            targetRef={ref}
            name={exportFileNameForPath(pathname)}
            title={exportTitleForPath(pathname)}
            label="Download page"
          />
        </div>
      ) : null}
    </div>
  );
}
