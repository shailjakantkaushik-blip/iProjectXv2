import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ProcessingAnimation } from "@/components/processing-animation";

type PageLoadingProps = {
  label?: string;
  /** Full viewport overlay (default) vs fill parent */
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional background override (e.g. landing theme) */
  style?: CSSProperties;
};

/**
 * Brand loading state — mark + label as one centred group.
 *
 * Full-screen uses a fixed viewport layer and absolutely centres the cluster
 * so Suspense / ClientOnly fallbacks match the auth gate (no spinner-up /
 * caption-centre split).
 */
export function PageLoading({
  label = "Loading…",
  fullScreen = true,
  size = "sm",
  className,
  style,
}: PageLoadingProps) {
  return (
    <div
      className={cn(
        "bg-background px-4",
        fullScreen
          ? "fixed inset-0 z-[200] h-[100dvh] w-[100dvw]"
          : "relative w-full min-h-[min(60vh,28rem)] flex-1 py-10",
        className,
      )}
      style={style}
      aria-busy="true"
    >
      {/* One unit pinned to the geometric centre of this layer */}
      <div className="absolute left-1/2 top-1/2 flex w-max max-w-[min(100%,22rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center">
        <ProcessingAnimation label={label} size={size} />
      </div>
    </div>
  );
}

/**
 * Router / Suspense / ClientOnly fallback — same fixed centre as session check.
 * Must stay full-screen: fullScreen={false} left the mark near the top while
 * Gate later painted "Checking your session…" in the true viewport centre.
 */
export function RoutePending() {
  return <PageLoading label="Loading…" size="sm" />;
}

/** Auth-gate pending — same copy + placement as Gate's session loader. */
export function SessionPending() {
  return <PageLoading label="Checking your session…" size="sm" />;
}
