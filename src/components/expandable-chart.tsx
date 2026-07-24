import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
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
 *
 * Note: do not detect chart types by component.name — production builds minify
 * those names and the expand modal would render blank.
 */
export function ExpandableChart({
  title,
  children,
  legend,
  className,
  heightClass = "h-64",
}: Props) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [chartSize, setChartSize] = useState({ width: 960, height: 520 });
  const measureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const measure = () => {
      const el = measureRef.current;
      if (!el) return;
      const w = Math.max(280, Math.floor(el.clientWidth));
      const h = Math.max(280, Math.floor(el.clientHeight));
      setChartSize({ width: w, height: h });
      if (!cancelled) setReady(true);
    };
    // Wait for dialog open animation / layout
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 200);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    if (measureRef.current && ro) ro.observe(measureRef.current);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
    };
  }, [open]);

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
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background/80 px-2 text-[10px] font-medium text-muted-foreground opacity-70 transition hover:opacity-100 hover:text-foreground group-hover:opacity-100"
            title="Expand chart"
          >
            <Maximize2 className="h-3 w-3" />
            Expand
          </button>
        </div>
        <button
          type="button"
          className={cn(
            "w-full shrink-0 cursor-zoom-in border-0 bg-transparent p-0 text-left",
            heightClass,
          )}
          onClick={() => setOpen(true)}
          aria-label={`Expand ${title}`}
        >
          {chart ? (
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full w-full items-center justify-center">{children}</div>
          )}
        </button>
        {legend ? <div className="min-h-0 shrink">{legend}</div> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="z-[80] flex max-h-[min(94dvh,940px)] w-[min(96vw,1100px)] max-w-[1100px] flex-col gap-3 overflow-hidden p-3 sm:p-6">
          <DialogHeader className="shrink-0 space-y-0 pr-8 text-left">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto">
            <div
              ref={measureRef}
              className="w-full rounded-lg border border-border/70 bg-surface p-2 sm:p-3"
              style={{
                height: "min(520px, calc(100dvh - 12rem))",
                minHeight: "min(280px, calc(100dvh - 12rem))",
              }}
            >
              {chart && ready ? (
                <ResponsiveContainer
                  key={`expanded-${title}-${chartSize.width}x${chartSize.height}`}
                  width="100%"
                  height="100%"
                  minWidth={200}
                  minHeight={200}
                >
                  {cloneElement(chart)}
                </ResponsiveContainer>
              ) : chart ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading chart…
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center">{children}</div>
              )}
            </div>

            {legend ? (
              <div className="mt-3 max-h-48 overflow-auto rounded-md border border-border/50 bg-muted/20 p-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Details
                </div>
                {legend}
              </div>
            ) : null}
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
