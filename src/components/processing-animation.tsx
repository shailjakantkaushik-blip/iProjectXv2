import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/iprojectx-mark-sm.png";

type ProcessingAnimationProps = {
  /** Visible status line under the mark */
  label?: string;
  /** Visual size of the mark */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_PX = { sm: 56, md: 88, lg: 128 } as const;

/**
 * Brand processing animation — pulsing X mark, orbit ring, drifting pixels,
 * and a light sweep. Use whenever a user-facing action is in progress.
 */
export function ProcessingAnimation({
  label = "Processing…",
  size = "md",
  className,
}: ProcessingAnimationProps) {
  const px = SIZE_PX[size];
  return (
    <div
      className={cn("processing-anim flex flex-col items-center gap-4", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="processing-anim__stage" style={{ width: px, height: px }}>
        <span className="processing-anim__glow" aria-hidden />
        <span className="processing-anim__ring" aria-hidden />
        <span className="processing-anim__ring processing-anim__ring--lag" aria-hidden />
        <img
          src={MARK_SRC}
          alt=""
          width={px}
          height={px}
          className="processing-anim__mark"
          draggable={false}
        />
        <span className="processing-anim__sweep" aria-hidden />
        <span className="processing-anim__pixel processing-anim__pixel--a" aria-hidden />
        <span className="processing-anim__pixel processing-anim__pixel--b" aria-hidden />
        <span className="processing-anim__pixel processing-anim__pixel--c" aria-hidden />
        <span className="processing-anim__pixel processing-anim__pixel--d" aria-hidden />
        <span className="processing-anim__pixel processing-anim__pixel--e" aria-hidden />
      </div>
      {label ? (
        <div className="processing-anim__label text-center">
          <div className="text-sm font-medium tracking-wide text-foreground">{label}</div>
          <div className="processing-anim__dots mt-1 flex justify-center gap-1" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ProcessingOverlayProps = {
  open: boolean;
  label?: string;
  /** Cover only the parent (relative) instead of the viewport */
  contained?: boolean;
  className?: string;
};

/** Dimmed overlay with the brand processing animation. */
export function ProcessingOverlay({
  open,
  label = "Processing…",
  contained = false,
  className,
}: ProcessingOverlayProps) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "processing-overlay z-50 flex items-center justify-center",
        contained ? "absolute inset-0" : "fixed inset-0",
        className,
      )}
      role="alertdialog"
      aria-busy="true"
      aria-label={label}
    >
      <div className="processing-overlay__panel rounded-2xl border border-border/60 bg-background/90 px-10 py-8 shadow-2xl backdrop-blur-md">
        <ProcessingAnimation label={label} size="lg" />
      </div>
    </div>
  );
}
