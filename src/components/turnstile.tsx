import { memo, useEffect, useRef } from "react";

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

let loadPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

/**
 * Cloudflare Turnstile widget.
 * Callbacks are held in refs so parent re-renders do not remount/reset the
 * challenge (which felt like the login page "refreshing").
 * Memoized so auth form state updates (e.g. token stored) do not recreate the iframe.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  theme = "auto",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        // Avoid double-render if effect re-runs before cleanup finishes.
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
          // Always show the widget so users can see the Cloudflare check.
          appearance: "always",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => {
            onExpireRef.current?.();
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
        });
      })
      .catch((e) => console.error(e));
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
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return (
    <div className="flex min-h-[65px] flex-col items-center justify-center gap-1">
      <div ref={containerRef} className="flex justify-center" />
      <p className="text-[10px] text-muted-foreground">
        Secured by Cloudflare — complete the check before signing in.
      </p>
    </div>
  );
});

export function isTurnstileEnabled(): boolean {
  return Boolean(getTurnstileSiteKey());
}
