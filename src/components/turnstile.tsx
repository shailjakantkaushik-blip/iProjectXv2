import { memo, useEffect, useRef, useState } from "react";
import { isTurnstileScriptSrc } from "@/lib/turnstile-load";
import {
  turnstileAuthWidgetSize,
  turnstileBoxForSize,
  turnstileHostHasWidget,
  turnstileShouldRemount,
} from "@/lib/turnstile-size";

export { turnstileSizeForHost, turnstileSizeForWidth } from "@/lib/turnstile-size";

export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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

export function resetTurnstileLoader() {
  loadPromise = null;
}

function existingTurnstileScript(): HTMLScriptElement | null {
  const scripts = document.querySelectorAll("script[src]");
  for (const node of scripts) {
    const el = node as HTMLScriptElement;
    if (isTurnstileScriptSrc(el.getAttribute("src") || el.src)) return el;
  }
  return null;
}

/**
 * Resolve when `window.turnstile` exists. Do not wait on `script.onload` —
 * the auth HTML starts the tag during parse, and Mobile Safari fires `load`
 * before this module runs.
 */
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = existingTurnstileScript();
    if (!existing) {
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

if (typeof window !== "undefined") {
  void loadScript();
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  /**
   * Increment to force a widget reset after a token is consumed or a sign-in
   * attempt fails. Without this, Sign in stays disabled until a full refresh.
   */
  resetNonce?: number;
}

/**
 * Cloudflare Turnstile widget.
 *
 * Login always mounts the official 300×65 checkbox (never compact). Do not
 * remount after render() returns — Safari innerHTML misses the live iframe
 * and a remount loop left login stuck on “Loading Cloudflare check…”.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  theme = "light",
  resetNonce = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const prevResetNonceRef = useRef(resetNonce);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();
  const size = turnstileAuthWidgetSize();
  const box = turnstileBoxForSize(size);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    setError(null);

    const mount = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      const hasIframe = turnstileHostHasWidget(containerRef.current);
      if (
        !turnstileShouldRemount({
          widgetId: widgetIdRef.current,
          hasIframe,
        })
      ) {
        return;
      }
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* noop */
        }
        widgetIdRef.current = null;
      }
      containerRef.current.replaceChildren();
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        appearance: "always",
        retry: "auto",
        "refresh-expired": "auto",
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => {
          onExpireRef.current?.();
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
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

    const failTimer = window.setTimeout(() => {
      if (cancelled) return;
      if (!turnstileHostHasWidget(containerRef.current) && !widgetIdRef.current) {
        setError("Cloudflare check did not load. Tap to retry.");
      }
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(failTimer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* noop */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, retry, size]);

  useEffect(() => {
    if (prevResetNonceRef.current === resetNonce) return;
    prevResetNonceRef.current = resetNonce;
    if (!widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
    } catch {
      /* noop */
    }
  }, [resetNonce]);

  if (!siteKey) return null;

  return (
    <div className="turnstile-host flex w-full flex-col items-center justify-center gap-1 overflow-visible">
      <div
        ref={containerRef}
        className="mx-auto block overflow-visible"
        style={{
          width: box.widthPx,
          minWidth: box.widthPx,
          minHeight: box.heightPx,
        }}
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
});
