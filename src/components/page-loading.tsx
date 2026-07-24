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
 * Brand loading state — mark + label as one group, always centred.
 * Full-screen uses a fixed viewport overlay so auth/workspace boot never
 * leaves the spinner at the top and the text in the middle.
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
        "flex items-center justify-center bg-background px-4",
        fullScreen
          ? "fixed inset-0 z-[90] h-[100dvh] w-full"
          : "w-full min-h-[min(60vh,28rem)] flex-1 py-10",
        className,
      )}
      style={style}
      aria-busy="true"
    >
      {/* Single centred unit — mark and caption stay together */}
      <div className="flex flex-col items-center justify-center">
        <ProcessingAnimation label={label} size={size} />
      </div>
    </div>
  );
}

/** Router default pending — centred in the content pane (not stuck to the top). */
export function RoutePending() {
  return <PageLoading label="Loading…" size="sm" fullScreen={false} />;
}
