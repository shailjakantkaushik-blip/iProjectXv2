import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/iprojectx-mark.webp";
const MARK_FALLBACK = "/brand/iprojectx-mark-sm.png";

type ProcessingAnimationProps = {
  /** Visible status line under the mark */
  label?: string;
  /** Visual size of the mark — keep small by default */
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Compact mark sizes (px). */
const SIZE_PX = { sm: 36, md: 48, lg: 56 } as const;

/**
 * Subtle brand processing mark — centred X with a steady spin.
 * No bounce / float / Y-travel motion.
 */
export function ProcessingAnimation({
  label = "Processing…",
  size = "sm",
  className,
}: ProcessingAnimationProps) {
  const px = SIZE_PX[size];
  return (
    <div
      className={cn(
        "processing-anim flex flex-col items-center justify-center",
        size === "sm" ? "gap-2.5" : "gap-3",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="processing-anim__stage" style={{ width: px, height: px }}>
        <span className="processing-anim__stage-bg" aria-hidden />
        <span className="processing-anim__glow" aria-hidden />
        <img
          src={MARK_SRC}
          alt=""
          width={px}
          height={px}
          className="processing-anim__mark"
          draggable={false}
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src.includes("webp")) img.src = MARK_FALLBACK;
          }}
        />
      </div>
      {label ? (
        <div className="processing-anim__label text-center">
          <div className="text-xs font-medium tracking-wide text-muted-foreground">{label}</div>
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

/** Dimmed overlay with the brand processing animation — always centred. */
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
        "processing-overlay z-[200] flex items-center justify-center",
        contained ? "absolute inset-0" : "fixed inset-0",
        className,
      )}
      role="alertdialog"
      aria-busy="true"
      aria-label={label}
    >
      <div className="processing-overlay__panel rounded-xl border border-border/60 bg-background/95 px-6 py-5 shadow-xl backdrop-blur-md">
        <ProcessingAnimation label={label} size="sm" />
      </div>
    </div>
  );
}
