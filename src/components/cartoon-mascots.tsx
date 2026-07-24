import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartoonId, useCartoonsEnabled } from "@/lib/use-cartoons";
import { cartoonMeta, type CartoonId } from "@/lib/cartoons";
import { CartoonCharacterSvg } from "@/components/cartoon-characters";

const TIPS = [
  "Tip: Check My Work for approvals waiting on you.",
  "Tip: Red RAG projects need a decision this week.",
  "Tip: Capture a lesson before the next stage gate.",
  "Tip: Keep baselines updated after major scope changes.",
  "Tip: Use Portfolio Scenarios before cutting budget.",
];

type Size = "sm" | "md" | "lg";

function sizePx(size: Size) {
  return size === "lg" ? 148 : size === "sm" ? 88 : 112;
}

/** Flat vector guide character — CSS animated, clickable. Variant from platform cartoon picker. */
export function CartoonGuide({
  size = "md",
  mood = "idle",
  className,
  label,
  interactive = true,
  onActivate,
  variant,
}: {
  size?: Size;
  mood?: "idle" | "wave" | "think";
  className?: string;
  label?: string;
  interactive?: boolean;
  onActivate?: () => void;
  /** Override platform cartoon (e.g. settings preview while editing). */
  variant?: CartoonId;
}) {
  const [localMood, setLocalMood] = useState(mood);
  const platformCartoon = useCartoonId();
  const cartoonId = variant ?? platformCartoon;
  const meta = cartoonMeta(cartoonId);
  const px = sizePx(size);
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `cg-body-${uid}`;
  const screenGrad = `cg-screen-${uid}`;
  const aria = label ?? meta.name;

  useEffect(() => setLocalMood(mood), [mood]);

  const activate = () => {
    if (!interactive) return;
    setLocalMood((m) => (m === "wave" ? "think" : "wave"));
    onActivate?.();
  };

  const moodClass = cn(
    localMood === "wave" && "is-wave",
    localMood === "think" && "is-think",
  );

  return (
    <button
      type="button"
      disabled={!interactive}
      aria-label={aria}
      title={interactive ? "Click for a tip" : aria}
      onClick={activate}
      className={cn(
        "cartoon-mascot group relative inline-flex select-none appearance-none border-0 bg-transparent p-0",
        interactive ? "cursor-pointer" : "cursor-default",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <CartoonCharacterSvg
        id={cartoonId}
        px={px}
        moodClass={moodClass}
        bodyGrad={bodyGrad}
        screenGrad={screenGrad}
      />
    </button>
  );
}

/** Compact welcome strip for home / empty states. */
export function CartoonWelcomeBanner({
  title = "Your portfolio guide is online",
  subtitle = "Click the character for a quick nudge — turn cartoons off anytime in Platform Settings.",
  className,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const enabled = useCartoonsEnabled();
  const [tipIdx, setTipIdx] = useState(0);
  const [showTip, setShowTip] = useState(false);

  if (!enabled) return null;

  const nextTip = () => {
    setTipIdx((i) => (i + 1) % TIPS.length);
    setShowTip(true);
  };

  return (
    <div
      className={cn(
        "cartoon-banner mb-4 flex items-center gap-3 overflow-hidden rounded-xl border border-border/80 bg-gradient-to-r from-secondary/80 via-surface to-surface px-3 py-2.5 sm:gap-4 sm:px-4",
        className,
      )}
    >
      <CartoonGuide size="sm" className="shrink-0" onActivate={nextTip} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {showTip ? TIPS[tipIdx] : subtitle}
        </div>
      </div>
    </div>
  );
}

/** Floating companion in the app shell (dismissible for the session). */
export function CartoonCompanion() {
  const enabled = useCartoonsEnabled();
  const [dismissed, setDismissed] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem("pmo.cartoons.dismissed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (!enabled || dismissed) return null;

  // Portal to body so style themes that set `.shell-root > * { position: relative }`
  // cannot turn this into a flex column (which wasted width on the right).
  const node = (
    <div className="cartoon-companion pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden sm:bottom-6 sm:right-6">
      {open && tip && (
        <div className="pointer-events-auto max-w-[220px] rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground shadow-md">
          {tip}
        </div>
      )}
      <div className="pointer-events-auto relative">
        <button
          type="button"
          aria-label="Dismiss cartoons for this session"
          className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm hover:text-foreground"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem("pmo.cartoons.dismissed", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <CartoonGuide
          size="md"
          mood={open ? "wave" : "idle"}
          onActivate={() => {
            setTip(TIPS[Math.floor(Math.random() * TIPS.length)]);
            setOpen(true);
          }}
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

/** Static preview used on Platform Settings (always visible regardless of flag). */
export function CartoonSettingsPreview({
  enabled,
  cartoonId,
}: {
  enabled: boolean;
  cartoonId?: CartoonId;
}) {
  const meta = cartoonMeta(cartoonId ?? "guide");
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border px-4 py-3 transition-opacity",
        enabled
          ? "border-border bg-secondary/40 opacity-100"
          : "border-dashed border-border/70 opacity-50",
      )}
    >
      <CartoonGuide
        size="md"
        interactive={enabled}
        mood={enabled ? "wave" : "idle"}
        variant={cartoonId}
      />
      <div className="min-w-0 text-sm">
        <div className="font-medium text-foreground">
          {enabled ? `${meta.name} is on` : "Cartoons are off"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {enabled
            ? "A floating guide appears in the app, with a welcome strip on Home. Click for tips."
            : "Interactive characters are hidden across the workspace until you turn them back on."}
        </p>
      </div>
    </div>
  );
}
