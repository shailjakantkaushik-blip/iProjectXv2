/**
 * Reusable "Explain" control — opens a popover with metric drivers.
 */
import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MetricExplanation } from "@/lib/explain-metric";

export function ExplainThis({
  explanation,
  className,
  label = "Explain",
  size = "sm",
}: {
  explanation: MetricExplanation | null | undefined;
  className?: string;
  label?: string;
  size?: "sm" | "xs";
}) {
  if (!explanation) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded border border-border/80 bg-background/80 font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground print:hidden",
            size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
            className,
          )}
          aria-label={`Explain ${explanation.title}`}
        >
          <HelpCircle className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3"
        sideOffset={6}
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {explanation.title}
        </div>
        <p className="text-sm font-medium leading-snug text-foreground">{explanation.headline}</p>
        <ul className="space-y-1.5 text-sm text-foreground/90">
          {explanation.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {(explanation.periodLabel || explanation.confidence !== "high") && (
          <p className="border-t border-border pt-2 text-[10px] text-muted-foreground">
            {explanation.periodLabel ? `${explanation.periodLabel} · ` : ""}
            Confidence: {explanation.confidence}
            {explanation.confidence === "low"
              ? " — add monthly FTE, milestones, and vendor costs for richer drivers"
              : ""}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Value + Explain control for inline money figures. */
export function ExplainableValue({
  value,
  explanation,
  className,
}: {
  value: ReactNode;
  explanation?: MetricExplanation | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span>{value}</span>
      <ExplainThis explanation={explanation} size="xs" />
    </span>
  );
}
