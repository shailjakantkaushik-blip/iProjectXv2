import { memo, useEffect, useRef } from "react";
import {
  readTurnstileFrameToken,
  readTurnstileTokenFromFrameWindow,
  turnstileFrameControlMessage,
  turnstileFrameSrc,
} from "@/lib/turnstile-frame";
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
 * Standard Cloudflare checkbox (300×65 rectangle) on every surface.
 *
 * The widget lives in a same-origin frame so a cold phone-browser open of
 * /auth can paint it without waiting on React. On success the frame retries
 * the token until this page is listening, so Sign in can enable.
 */
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onExpire,
  resetNonce = 0,
}: Props) {
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const gotTokenRef = useRef(false);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  const siteKey = getTurnstileSiteKey();

  useEffect(() => {
    gotTokenRef.current = false;

    const acceptToken = (token: string) => {
      if (!token) {
        gotTokenRef.current = false;
        onExpireRef.current?.();
        return;
      }
      gotTokenRef.current = true;
      onTokenRef.current(token);
      const win = iframeRef.current?.contentWindow;
      try {
        win?.postMessage(turnstileFrameControlMessage("ack"), window.location.origin);
      } catch {
        /* ignore */
      }
    };

    const pullFromFrame = () => {
      if (gotTokenRef.current) return;
      const token = readTurnstileTokenFromFrameWindow(
        iframeRef.current?.contentWindow as {
          iprojectxLastTurnstileToken?: () => string;
          document?: { querySelector: (selector: string) => { value?: string } | null };
        } | null,
      );
      if (token) acceptToken(token);
    };

    const pingReady = () => {
      const win = iframeRef.current?.contentWindow;
      try {
        win?.postMessage(turnstileFrameControlMessage("ready"), window.location.origin);
      } catch {
        /* ignore */
      }
      pullFromFrame();
    };

    const onMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      const fromThisFrame = Boolean(frameWindow && event.source === frameWindow);
      if (event.source && frameWindow && !fromThisFrame) return;
      if (!fromThisFrame && event.origin !== window.location.origin) return;
      const token = readTurnstileFrameToken(event.data);
      if (token == null) return;
      acceptToken(token);
    };

    window.addEventListener("message", onMessage);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", pingReady);
    pingReady();
    const poll = window.setInterval(pingReady, 300);
    const stop = window.setTimeout(() => window.clearInterval(poll), 12_000);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", pingReady);
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [resetNonce]);

  if (!siteKey) return null;

  return (
    <div className="auth-turnstile flex w-full flex-col items-center justify-center gap-1 overflow-visible">
      <iframe
        ref={iframeRef}
        key={resetNonce}
        data-turnstile-frame=""
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
