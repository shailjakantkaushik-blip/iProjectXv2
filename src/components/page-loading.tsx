import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ProcessingAnimation } from "@/components/processing-animation";

type PageLoadingProps = {
  label?: string;
  /**
   * Full viewport overlay. Default false — in-app loaders must stay in-flow so
   * the document keeps scrolling and the shell chrome stays usable (best practice).
   * Use fullScreen only for cold gates before AppShell exists (auth/session/MFA).
   */
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional background override (e.g. landing theme) */
  style?: CSSProperties;
};

/**
 * Brand loading state — mark + label as one centred group.
 *
 * - In-flow (default): fills the content area; document scroll stays native.
 * - Full-screen: fixed viewport layer for cold auth/session gates only.
 */
export function PageLoading({
  label = "Loading…",
  fullScreen = false,
  size = "sm",
  className,
  style,
}: PageLoadingProps) {
  return (
    <div
      className={cn(
        "bg-background px-4",
        fullScreen
          ? "fixed inset-0 z-[200] h-full w-full"
          : "relative w-full min-h-[min(60vh,28rem)] flex-1 py-10",
        className,
      )}
      style={style}
      aria-busy="true"
    >
      <div className="absolute left-1/2 top-1/2 flex w-max max-w-[min(100%,22rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center">
        <ProcessingAnimation label={label} size={size} />
      </div>
    </div>
  );
}

/**
 * Router pending for in-app navigations — in-flow only.
 * Fixed overlays inside Outlet freeze scroll and cover the shell (anti-pattern).
 */
export function RoutePending() {
  return <PageLoading label="Loading…" size="sm" />;
}

/** Cold auth-gate pending — full-screen before AppShell exists. */
export function SessionPending() {
  return <PageLoading label="Checking your session…" size="sm" fullScreen />;
}
