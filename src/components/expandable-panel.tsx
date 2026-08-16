import { useState, type ReactNode } from "react";
import { ChevronDown, Maximize2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactNode;
  /** Optional controls rendered next to the Expand button (filters, etc.) */
  toolbar?: ReactNode;
  className?: string;
  /** Max height of the in-page (compact) body; scroll if content overflows */
  compactMaxHeightClass?: string;
  id?: string;
  /** Collapse the in-page body. Expand still opens the full modal. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  collapsedSummary?: ReactNode;
};

/**
 * Section wrapper with an Expand control. Expanded view is a large modal whose
 * body scrolls vertically/horizontally when content exceeds the viewport.
 */
export function ExpandablePanel({
  title,
  children,
  toolbar,
  className,
  compactMaxHeightClass = "max-h-[min(70vh,720px)]",
  id,
  collapsible = false,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  collapsedSummary,
}: Props) {
  const [open, setOpen] = useState(false);
  const isControlled = collapsed !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsible && (isControlled ? collapsed : internalCollapsed);
  const setIsCollapsed = (next: boolean) => {
    if (!isControlled) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <>
      <div id={id} className={cn("relative", className)}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {collapsible ? (
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground print:hidden"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Show ${title}` : `Hide ${title}`}
                title={isCollapsed ? "Show" : "Hide"}
                data-export-hide
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
            ) : null}
            <div className="min-w-0 flex-1 text-[12px] font-semibold text-foreground sm:text-sm">
              {title}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {collapsible ? (
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="inline-flex h-7 items-center rounded-md border border-border/70 bg-background/80 px-2 text-[10px] font-medium text-muted-foreground transition hover:text-foreground print:hidden"
                data-export-hide
              >
                {isCollapsed ? "Show" : "Hide"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background/80 px-2 text-[10px] font-medium text-muted-foreground transition hover:text-foreground hover:opacity-100 print:hidden"
              title={`Expand ${title}`}
              data-export-hide
            >
              <Maximize2 className="h-3 w-3" />
              Expand
            </button>
          </div>
        </div>
        {isCollapsed ? (
          collapsedSummary ? (
            <p className="text-xs text-muted-foreground">{collapsedSummary}</p>
          ) : null
        ) : (
          <div className={cn("overflow-auto", compactMaxHeightClass)}>{children}</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="z-[80] flex max-h-[94vh] w-[min(98vw,1400px)] max-w-[1400px] flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 space-y-0 pr-8 text-left">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70 bg-surface p-2 sm:p-3">
            {children}
          </div>

          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
