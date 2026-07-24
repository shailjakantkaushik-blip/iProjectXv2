import { useIsFetching } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * Thin top progress cue while React Query refetches in the background.
 * Never replaces page content — professional stale-while-revalidate UX.
 */
export function SoftUpdatingBar({ className }: { className?: string }) {
  const fetching = useIsFetching();
  if (!fetching) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Updating data"
    >
      <div className="soft-updating-bar h-full w-1/3 bg-primary/80" />
    </div>
  );
}

/** Inline muted label for section-level soft refresh. */
export function SoftUpdatingLabel({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  if (!active) return null;
  return (
    <span
      className={cn("text-[10px] font-medium uppercase tracking-wide text-muted-foreground", className)}
      aria-live="polite"
    >
      Updating…
    </span>
  );
}
