import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readTurnstileFrameToken, turnstileFrameSrc } from "@/lib/turnstile-frame";
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
 * Login Cloudflare check for mobile browsers.
 *
 * In-app / SPA navigation already has JS running, so a React widget can work.
 * A cold open in Safari/Chrome (the phone browser) often never paints that
 * widget. Host Cloudflare’s official implicit widget in a same-origin frame
 * so it does not depend on React hydration.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  resetNonce = 0,
}: Props) {
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const [size, setSize] = useState<TurnstileWidgetSize>("compact");
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();
  const box = turnstileBoxForSize(size);

  useLayoutEffect(() => {
    setSize(readDeviceSize());
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const token = readTurnstileFrameToken(event.data);
      if (token == null) return;
      if (token) onTokenRef.current(token);
      else onExpireRef.current?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!siteKey) return null;

  return (
    <div className="auth-turnstile flex w-full flex-col items-center justify-center gap-1 overflow-visible">
      <iframe
        key={`${size}-${resetNonce}`}
        title="Cloudflare security check"
        src={turnstileFrameSrc(siteKey, size)}
        width={box.widthPx}
        height={box.heightPx}
        style={{
          width: box.widthPx,
          height: box.heightPx,
          border: 0,
          overflow: "hidden",
        }}
      />
      <p className="text-[10px] text-muted-foreground">
        Secured by Cloudflare — complete the check before signing in.
      </p>
    </div>
  );
});
