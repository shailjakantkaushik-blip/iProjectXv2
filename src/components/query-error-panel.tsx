import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
};

/**
 * Inline recovery UI when a dashboard query fails — retry without leaving the page.
 */
export function QueryErrorPanel({
  title = "Couldn’t load data",
  message = "A temporary network or server issue interrupted loading. Try again.",
  onRetry,
  className,
  compact,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5",
        compact ? "px-3 py-2" : "px-4 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <div className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
            {title}
          </div>
          <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {message}
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      )}
    </div>
  );
}
