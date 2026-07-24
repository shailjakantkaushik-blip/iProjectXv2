import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const IGNORE_KEYS = new Set(["notifications", "landing-config", "org-members", "profiles"]);

/**
 * Thin top progress cue while React Query refetches in the background.
 * Debounced + filtered so notification polls don't animate the sticky header.
 */
export function SoftUpdatingBar({ className }: { className?: string }) {
  const fetching = useIsFetching({
    predicate: (q) => {
      if (q.state.fetchStatus !== "fetching") return false;
      const root = q.queryKey[0];
      return typeof root !== "string" || !IGNORE_KEYS.has(root);
    },
  });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (fetching > 0) {
      const t = window.setTimeout(() => setShow(true), 220);
      return () => window.clearTimeout(t);
    }
    setShow(false);
  }, [fetching]);

  if (!show) return null;
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
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
      Updating…
    </span>
  );
}
