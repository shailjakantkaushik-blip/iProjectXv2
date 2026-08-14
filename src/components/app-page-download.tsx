import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { DownloadMenu } from "@/components/page-export";
import {
  exportFileNameForPath,
  exportTitleForPath,
  usePageDownloadAllowed,
} from "@/lib/page-download";

/**
 * Layout wrapper: page content + "Download page".
 * The control is portaled to document.body at z-45 so it sits in front of the
 * cartoon companion (also body-portaled, z-40) and is not trapped in theme
 * stacking contexts (`.shell-root > * { z-index: 1 }`).
 */
export function AppPageDownload({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = usePageDownloadAllowed(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bar = allowed ? (
    <div
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(5.75rem,calc(env(safe-area-inset-right)+4.75rem))] z-[45] print:hidden sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:right-28"
      data-export-hide
    >
      <DownloadMenu
        targetRef={ref}
        name={exportFileNameForPath(pathname)}
        title={exportTitleForPath(pathname)}
        label="Download page"
      />
    </div>
  ) : null;

  return (
    <div className="relative">
      <div ref={ref} data-export-root>
        {children}
      </div>
      {mounted && bar ? createPortal(bar, document.body) : null}
    </div>
  );
}
