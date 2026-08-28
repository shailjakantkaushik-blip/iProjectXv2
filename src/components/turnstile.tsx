import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  isPhoneBrowser,
  turnstileBoxForSize,
  turnstileSizeForDevice,
  type TurnstileWidgetSize,
} from "@/lib/turnstile-size";

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
 * Cloudflare Turnstile via the official React wrapper
 * (`@marsidev/react-turnstile`). The widget is client-only (Turnstile cannot
 * run during SSR). Phones use compact (150×140 square); desktop/laptop use
 * the standard 300×65 rectangle.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  theme = "auto",
  resetNonce = 0,
}: Props) {
  const widgetRef = useRef<TurnstileInstance | undefined>(undefined);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const prevResetNonceRef = useRef(resetNonce);
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState<TurnstileWidgetSize>("compact");
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();
  const box = turnstileBoxForSize(size);

  useLayoutEffect(() => {
    setSize(readDeviceSize());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (prevResetNonceRef.current === resetNonce) return;
    prevResetNonceRef.current = resetNonce;
    widgetRef.current?.reset();
  }, [resetNonce]);

  if (!siteKey) return null;

  return (
    <div className="auth-turnstile flex w-full flex-col items-center justify-center gap-1 overflow-visible">
      <div
        className="flex items-center justify-center overflow-visible"
        style={{
          width: box.widthPx,
          minWidth: box.widthPx,
          minHeight: box.heightPx,
        }}
      >
        {mounted ? (
          <Turnstile
            ref={widgetRef}
            siteKey={siteKey}
            options={{
              theme,
              size,
              appearance: "always",
              retry: "auto",
              refreshExpired: "auto",
            }}
            scriptOptions={{ async: true, defer: true, appendTo: "head" }}
            onSuccess={(token) => onTokenRef.current(token)}
            onExpire={() => onExpireRef.current?.()}
            onError={() => onExpireRef.current?.()}
          />
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Secured by Cloudflare — complete the check before signing in.
      </p>
    </div>
  );
});
