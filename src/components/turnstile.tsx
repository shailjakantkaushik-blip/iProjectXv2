import { memo, useEffect, useRef } from "react";
import {
  readTurnstileFrameToken,
  readTurnstileTokenFromFrameWindow,
  turnstileFrameControlMessage,
  turnstileFrameSrc,
} from "@/lib/turnstile-frame";
import { TURNSTILE_TOKEN_EVENT } from "@/lib/turnstile-token-bridge";
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
 * /auth can paint it. On success the frame writes the token onto this page
 * (hidden input / sessionStorage / event) so Sign in can enable even when
 * postMessage is missed.
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
      try {
        iframeRef.current?.contentWindow?.postMessage(
          turnstileFrameControlMessage("ack"),
          "*",
        );
      } catch {
        /* ignore */
      }
    };

    const pullFromFrame = () => {
      const token = readTurnstileTokenFromFrameWindow(
        iframeRef.current?.contentWindow as {
          iprojectxLastTurnstileToken?: () => string;
          document?: { querySelector: (selector: string) => { value?: string } | null };
        } | null,
      );
      if (token) acceptToken(token);
    };

    const pingReady = () => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          turnstileFrameControlMessage("ready"),
          "*",
        );
      } catch {
        /* ignore */
      }
      pullFromFrame();
    };

    const onMessage = (event: MessageEvent) => {
      const token = readTurnstileFrameToken(event.data);
      if (token == null) return;
      acceptToken(token);
    };

    const onBridge = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string") acceptToken(detail);
    };

    window.addEventListener("message", onMessage);
    window.addEventListener(TURNSTILE_TOKEN_EVENT, onBridge);
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", pingReady);
    pingReady();
    const poll = window.setInterval(pingReady, 300);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener(TURNSTILE_TOKEN_EVENT, onBridge);
      iframe?.removeEventListener("load", pingReady);
      window.clearInterval(poll);
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
