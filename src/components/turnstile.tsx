import { memo, useEffect, useRef } from "react";
import { readTurnstileFrameToken, turnstileFrameSrc } from "@/lib/turnstile-frame";
import {
  TURNSTILE_NORMAL_HEIGHT_PX,
  TURNSTILE_NORMAL_WIDTH_PX,
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

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  resetNonce?: number;
}

/**
 * Standard Cloudflare checkbox (300×65 rectangle) on every surface:
 * desktop, laptop, web app, and phone browsers.
 *
 * The widget lives in a same-origin frame so a cold Safari/Chrome open of
 * /auth can paint it without waiting on React hydration.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  resetNonce = 0,
}: Props) {
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  const siteKey = getTurnstileSiteKey();

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
        key={resetNonce}
        title="Cloudflare security check"
        src={turnstileFrameSrc(siteKey)}
        width={TURNSTILE_NORMAL_WIDTH_PX}
        height={TURNSTILE_NORMAL_HEIGHT_PX}
        style={{
          width: TURNSTILE_NORMAL_WIDTH_PX,
          height: TURNSTILE_NORMAL_HEIGHT_PX,
          maxWidth: "none",
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
