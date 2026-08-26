import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isIosSafariBrowser,
  turnstileBoxForSize,
  turnstileSizeForHost,
  type TurnstileWidgetSize,
} from "@/lib/turnstile-size";

export { turnstileSizeForHost, turnstileSizeForWidth } from "@/lib/turnstile-size";

export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
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

function readIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const standalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return isIosSafariBrowser(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints || 0,
    standalone,
  );
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

/** Safari can fire script load before window.turnstile is attached. */
function waitForTurnstile(timeoutMs = 12000): Promise<void> {
  return loadScript().then(() => {
    if (typeof window !== "undefined" && window.turnstile) return;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const id = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(id);
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          window.clearInterval(id);
          reject(new Error("Turnstile API missing"));
        }
      }, 40);
    });
  });
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
 * Callbacks are held in refs so parent re-renders do not remount/reset the
 * challenge (which felt like the login page "refreshing").
 * Memoized so auth form state updates (e.g. token stored) do not recreate the iframe.
 *
 * Never replace the host node with an error-only tree — that unmounts the
 * iframe. Mobile Safari is slow to paint it; tearing it down at 2.5s was why
 * the checkbox never appeared.
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
  const [size, setSize] = useState<TurnstileWidgetSize>("normal");
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();
  const box = turnstileBoxForSize(size);

  useLayoutEffect(() => {
    if (readIosSafari()) setSize("compact");
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    setError(null);
    const measureSize = () => {
      const el = containerRef.current;
      const host = el?.parentElement?.clientWidth || el?.clientWidth || 0;
      const viewport = typeof window !== "undefined" ? window.innerWidth : 0;
      return turnstileSizeForHost(host, viewport, readIosSafari());
    };
    const mount = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* noop */
        }
        widgetIdRef.current = null;
      }
      const nextSize = measureSize();
      setSize(nextSize);
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size: nextSize,
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
    waitForTurnstile()
      .then(mount)
      .catch(() => {
        if (!cancelled) setError("Cloudflare check did not load. Tap to retry.");
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* noop */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, retry]);

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
    <div className="turnstile-host flex w-full min-w-0 flex-col items-center justify-center gap-1 overflow-visible [filter:none] [transform:none]">
      <div
        ref={containerRef}
        className="mx-auto block max-w-full overflow-visible rounded-md bg-muted/40"
        style={{ width: box.widthPx, minHeight: box.heightPx }}
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
