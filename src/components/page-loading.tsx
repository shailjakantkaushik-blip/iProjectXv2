import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ProcessingAnimation } from "@/components/processing-animation";

type PageLoadingProps = {
  label?: string;
  /** Full viewport (default) vs fill parent */
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional background override (e.g. landing theme) */
  style?: CSSProperties;
};

/**
 * Standard full-page / section loading state using the brand processing mark.
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
        "flex flex-col items-center justify-center gap-2 bg-background px-4",
        fullScreen ? "min-h-screen w-full" : "min-h-[160px] w-full py-8",
        className,
      )}
      style={style}
      aria-busy="true"
    >
      <ProcessingAnimation label={label} size={size} />
    </div>
  );
}

/** Router default pending — used while route loaders run (in-shell, not fullscreen). */
export function RoutePending() {
  return <PageLoading label="Loading…" size="sm" fullScreen={false} />;
}
