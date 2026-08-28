import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isPhoneBrowser,
  turnstileBoxForSize,
  turnstileSizeForDevice,
  type TurnstileWidgetSize,
} from "@/lib/turnstile-size";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
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
  });
  return loadPromise;
}

function readDeviceSize(): TurnstileWidgetSize {
  if (typeof window === "undefined") return "compact";
  return turnstileSizeForDevice(
    isPhoneBrowser({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      viewportPx: window.innerWidth,
    }),
  );
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  resetNonce?: number;
}

/**
 * Login Cloudflare check.
 * First HTML uses the phone square (150×140) so a 300px desktop box is never
 * clipped on mobile. Desktop / laptop switch to the 300×65 rectangle.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  theme = "auto",
  resetNonce = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const prevResetNonceRef = useRef(resetNonce);
  const [size, setSize] = useState<TurnstileWidgetSize>("compact");
  const [ready, setReady] = useState(false);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();
  const box = turnstileBoxForSize(size);

  useLayoutEffect(() => {
    setSize(readDeviceSize());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        if (widgetIdRef.current && containerRef.current.querySelector("iframe")) {
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
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size,
          appearance: "always",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => {
            onExpireRef.current?.();
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
        });
        prevResetNonceRef.current = resetNonce;
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [ready, siteKey, theme, size]);

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
    <div className="auth-turnstile flex w-full flex-col items-center justify-center gap-1 overflow-visible">
      <div
        ref={containerRef}
        className="flex justify-center overflow-visible"
        suppressHydrationWarning
        style={{
          width: box.widthPx,
          minWidth: box.widthPx,
          minHeight: box.heightPx,
        }}
      />
      <p className="text-[10px] text-muted-foreground">
        Secured by Cloudflare — complete the check before signing in.
      </p>
    </div>
  );
});
