import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { ResponsiveContainer } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactElement;
  legend?: ReactNode;
  className?: string;
  /** Compact chart height (default 256 / h-64) */
  heightClass?: string;
};

/**
 * Chart card that opens a large modal on click (or via expand button).
 * Close with the X or Escape to return to the normal view.
 */
export function ExpandableChart({
  title,
  children,
  legend,
  className,
  heightClass = "h-64",
}: Props) {
  const [open, setOpen] = useState(false);

  const chart = isValidElement(children) ? children : null;

  return (
    <>
      <div
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface p-3 shadow-sm transition hover:border-primary/35 hover:shadow-md",
          className,
        )}
      >
        <div className="mb-2 flex shrink-0 items-center gap-2 px-1">
          <div className="min-w-0 flex-1 text-[12px] font-semibold text-foreground">{title}</div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background/80 px-2 text-[10px] font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
            title="Expand chart"
          >
            <Maximize2 className="h-3 w-3" />
            Expand
          </button>
        </div>
        <button
          type="button"
          className={cn("w-full shrink-0 cursor-zoom-in border-0 bg-transparent p-0 text-left", heightClass)}
          onClick={() => setOpen(true)}
          aria-label={`Expand ${title}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {chart as ReactElement}
          </ResponsiveContainer>
        </button>
        {legend ? <div className="min-h-0 shrink">{legend}</div> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1100px)] max-w-[1100px] flex-col gap-3 overflow-hidden p-4 sm:p-5">
          <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-[55vh] w-full flex-1 rounded-lg border border-border/70 bg-surface p-2 sm:min-h-[60vh]">
            <ResponsiveContainer width="100%" height="100%">
              {chart
                ? cloneElement(chart as ReactElement, {
                    /* recharts children often ignore extra props; clone keeps identity */
                  })
                : (null as any)}
            </ResponsiveContainer>
          </div>
          {legend ? <div className="max-h-28 overflow-auto">{legend}</div> : null}
          <div className="flex justify-end">
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
