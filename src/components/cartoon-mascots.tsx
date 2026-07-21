import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartoonsEnabled } from "@/lib/use-cartoons";

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

/** Flat vector PMO “guide” character — CSS animated, clickable. */
export function CartoonGuide({
  size = "md",
  mood = "idle",
  className,
  label = "PMO Guide",
  interactive = true,
  onActivate,
}: {
  size?: Size;
  mood?: "idle" | "wave" | "think";
  className?: string;
  label?: string;
  interactive?: boolean;
  onActivate?: () => void;
}) {
  const [localMood, setLocalMood] = useState(mood);
  const px = sizePx(size);
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `cg-body-${uid}`;
  const screenGrad = `cg-screen-${uid}`;

  useEffect(() => setLocalMood(mood), [mood]);

  const activate = () => {
    if (!interactive) return;
    setLocalMood((m) => (m === "wave" ? "think" : "wave"));
    onActivate?.();
  };

  return (
    <button
      type="button"
      disabled={!interactive}
      aria-label={label}
      title={interactive ? "Click for a tip" : label}
      onClick={activate}
      className={cn(
        "cartoon-mascot group relative inline-flex select-none appearance-none border-0 bg-transparent p-0",
        interactive ? "cursor-pointer" : "cursor-default",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <svg
        viewBox="0 0 160 160"
        width={px}
        height={px}
        className={cn(
          "cartoon-svg overflow-visible",
          localMood === "wave" && "is-wave",
          localMood === "think" && "is-think",
        )}
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id={screenGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e8edf3" />
            <stop offset="100%" stopColor="#c5d0de" />
          </linearGradient>
        </defs>

        <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />

        <g className="cg-body">
          <rect x="48" y="70" width="64" height="58" rx="22" fill={`url(#${bodyGrad})`} />
          <rect x="58" y="82" width="44" height="28" rx="8" fill={`url(#${screenGrad})`} />
          <path
            d="M66 102 L74 94 L82 98 L94 88"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="94" cy="88" r="2.5" fill="var(--accent2, #15803d)" />
        </g>

        <g className="cg-head">
          <circle cx="80" cy="48" r="28" fill="#f8fafc" stroke="var(--primary)" strokeWidth="3" />
          <circle className="cg-eye cg-eye-l" cx="70" cy="46" r="3.2" fill="#0f172a" />
          <circle className="cg-eye cg-eye-r" cx="90" cy="46" r="3.2" fill="#0f172a" />
          <path
            className="cg-mouth"
            d="M72 58 Q80 64 88 58"
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="70" cy="46" r="8" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
          <circle cx="90" cy="46" r="8" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
          <path d="M78 46 H82" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
        </g>

        <g className="cg-arm-l">
          <path
            d="M52 88 Q36 96 40 114"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </g>
        <g className="cg-arm-r">
          <path
            d="M108 88 Q124 90 118 70"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="116" cy="64" r="6" fill="#f8fafc" stroke="var(--primary)" strokeWidth="2.5" />
        </g>

        <g className="cg-sparkles" fill="var(--accent2, #15803d)">
          <circle cx="28" cy="40" r="2.5" />
          <circle cx="132" cy="52" r="2" />
          <circle cx="138" cy="92" r="1.8" />
        </g>
      </svg>
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

  return (
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
}

/** Static preview used on Platform Settings (always visible regardless of flag). */
export function CartoonSettingsPreview({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border px-4 py-3 transition-opacity",
        enabled
          ? "border-border bg-secondary/40 opacity-100"
          : "border-dashed border-border/70 opacity-50",
      )}
    >
      <CartoonGuide size="md" interactive={enabled} mood={enabled ? "wave" : "idle"} />
      <div className="min-w-0 text-sm">
        <div className="font-medium text-foreground">
          {enabled ? "Cartoons are on" : "Cartoons are off"}
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
