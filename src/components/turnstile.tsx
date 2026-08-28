import { memo, useEffect, useRef, useState } from "react";
import {
  findTurnstileScript,
  TURNSTILE_SRC,
} from "@/lib/turnstile-load";
import {
  TURNSTILE_SLOT_INNER_HTML,
  turnstileHostWidth,
  turnstileSizeForWidth,
} from "@/lib/turnstile-size";

export { turnstileSizeForWidth } from "@/lib/turnstile-size";
export { TURNSTILE_SRC };

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
      ready?: (cb: () => void) => void;
    };
  }
}

export function getTurnstileSiteKey(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  return (
    env.VITE_TURNSTILE_SITE_KEY ||
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    env.VITE_CF_TURNSTILE_SITE_KEY
  );
}

export function isTurnstileEnabled(): boolean {
  return Boolean(getTurnstileSiteKey());
}

let loadPromise: Promise<void> | null = null;
/** One host + widget for the login page — React remounts must not destroy it. */
let singletonHost: HTMLDivElement | null = null;
let singletonWidgetId: string | null = null;

export function resetTurnstileLoader() {
  loadPromise = null;
  if (singletonWidgetId && typeof window !== "undefined" && window.turnstile) {
    try {
      window.turnstile.remove(singletonWidgetId);
    } catch {
      /* noop */
    }
  }
  singletonWidgetId = null;
  if (singletonHost) {
    singletonHost.replaceChildren();
  }
}

function getSingletonHost(): HTMLDivElement {
  if (!singletonHost) {
    singletonHost = document.createElement("div");
    singletonHost.setAttribute("data-turnstile-singleton", "");
  }
  return singletonHost;
}

/**
 * Resolve when `window.turnstile` exists. Poll — do not wait on `script.onload`.
 * iPhone browsers (Safari, Chrome, Firefox — all WebKit) often never fire
 * `load` for a preloaded or already-parsed Turnstile tag.
 */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const nodes = Array.from(document.querySelectorAll("script[src]"));
    const already = findTurnstileScript(nodes);
    if (!already) {
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onerror = () => {
        loadPromise = null;
        reject(new Error("Failed to load Turnstile"));
      };
      document.head.appendChild(s);
    }
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(poll);
        resolve();
        return;
      }
      if (Date.now() - started > 15000) {
        window.clearInterval(poll);
        loadPromise = null;
        reject(new Error("Turnstile API missing"));
      }
    }, 40);
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  resetNonce?: number;
}

/**
 * Login Cloudflare checkbox.
 *
 * The iframe lives on a singleton DOM node that React does not own, so login
 * re-renders (logo, session, typing) cannot delete it. That is why the box
 * vanished on every mobile browser after the Safari experiments.
 */
export const TurnstileWidget = memo(
  function TurnstileWidget({
  onToken,
  onExpire,
  theme = "light",
  resetNonce = 0,
}: Props) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const prevResetNonceRef = useRef(resetNonce);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !slotRef.current) return;
    let cancelled = false;
    const slot = slotRef.current;
    const host = getSingletonHost();
    if (host.parentElement !== slot) slot.appendChild(host);

    const mount = () => {
      if (cancelled || !window.turnstile) return;
      if (host.parentElement !== slot) slot.appendChild(host);
      if (singletonWidgetId && !host.querySelector("iframe")) {
        singletonWidgetId = null;
      }
      if (singletonWidgetId && host.querySelector("iframe")) return;
      const width = turnstileHostWidth(
        slot.clientWidth || host.clientWidth,
        window.innerWidth,
      );
      const size = turnstileSizeForWidth(width);
      singletonWidgetId = window.turnstile.render(host, {
        sitekey: siteKey,
        theme,
        size,
        appearance: "always",
        retry: "auto",
        "refresh-expired": "auto",
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => {
          onExpireRef.current?.();
          if (singletonWidgetId && window.turnstile) {
            window.turnstile.reset(singletonWidgetId);
          }
        },
        "error-callback": () => {
          onExpireRef.current?.();
          setError("Cloudflare check did not finish. Tap to retry.");
        },
      });
      prevResetNonceRef.current = resetNonce;
    };

    const start = () => {
      if (cancelled) return;
      if (typeof window.turnstile?.ready === "function") {
        window.turnstile.ready(mount);
        return;
      }
      mount();
    };

    loadScript()
      .then(start)
      .catch(() => {
        if (!cancelled) setError("Cloudflare check did not load. Tap to retry.");
      });

    // Do not turnstile.remove() here. Auth remounts this component on mobile
    // (session, brand). Removing the singleton is what hid the checkbox.
    return () => {
      cancelled = true;
    };
  }, [siteKey, theme, retry]);

  useEffect(() => {
    if (prevResetNonceRef.current === resetNonce) return;
    prevResetNonceRef.current = resetNonce;
    if (!singletonWidgetId || !window.turnstile) return;
    try {
      window.turnstile.reset(singletonWidgetId);
    } catch {
      /* noop */
    }
  }, [resetNonce]);

  if (!siteKey) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-1 overflow-visible">
      <div
        ref={slotRef}
        className="mx-auto block w-full max-w-[300px] overflow-visible"
        suppressHydrationWarning
        dangerouslySetInnerHTML={TURNSTILE_SLOT_INNER_HTML}
        style={{ minHeight: 65 }}
      />
      {error ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => {
            resetTurnstileLoader();
            setError(null);
            setRetry((n) => n + 1);
          }}
        >
          {error} Retry
        </button>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          Secured by Cloudflare — complete the check before signing in.
        </p>
      )}
    </div>
  );
},
(prev, next) =>
  prev.theme === next.theme && prev.resetNonce === next.resetNonce,
);
