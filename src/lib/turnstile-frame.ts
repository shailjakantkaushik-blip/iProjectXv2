export const TURNSTILE_FRAME_PATH = "/turnstile-frame.html";
export const TURNSTILE_FRAME_MESSAGE_SOURCE = "iprojectx-turnstile";
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

export type TurnstileFrameControl = "ready" | "ack";

export function turnstileFrameSrc(siteKey: string): string {
  const params = new URLSearchParams({
    k: siteKey,
    size: "normal",
  });
  return `${TURNSTILE_FRAME_PATH}?${params.toString()}`;
}

export function turnstileFrameControlMessage(type: TurnstileFrameControl): {
  source: typeof TURNSTILE_FRAME_MESSAGE_SOURCE;
  type: TurnstileFrameControl;
} {
  return { source: TURNSTILE_FRAME_MESSAGE_SOURCE, type };
}

export function isTurnstileFrameControl(
  data: unknown,
  type: TurnstileFrameControl,
): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as { source?: unknown; type?: unknown };
  return payload.source === TURNSTILE_FRAME_MESSAGE_SOURCE && payload.type === type;
}

export function readTurnstileFrameToken(data: unknown): string | null {
  let payload: unknown = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const message = payload as { source?: unknown; token?: unknown; type?: unknown };
  if (message.source !== TURNSTILE_FRAME_MESSAGE_SOURCE) return null;
  if (message.type === "ready" || message.type === "ack") return null;
  return typeof message.token === "string" ? message.token : null;
}

type FrameWindow = {
  iprojectxLastTurnstileToken?: () => string;
  document?: {
    querySelector: (selector: string) => { value?: string } | null;
  };
};

/** Same-origin read of a token the iframe already collected. */
export function readTurnstileTokenFromFrameWindow(win: FrameWindow | null | undefined): string | null {
  if (!win) return null;
  try {
    const fromApi = win.iprojectxLastTurnstileToken?.();
    if (typeof fromApi === "string" && fromApi) return fromApi;
    const field = win.document?.querySelector(`[name="${TURNSTILE_RESPONSE_FIELD}"]`);
    const value = field?.value;
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

export function readLiveTurnstileTokenFromDom(): string | null {
  if (typeof document === "undefined") return null;
  const frames = document.querySelectorAll<HTMLIFrameElement>("iframe[data-turnstile-frame]");
  for (const frame of frames) {
    try {
      const token = readTurnstileTokenFromFrameWindow(frame.contentWindow as FrameWindow | null);
      if (token) return token;
    } catch {
      /* cross-origin or not yet loaded */
    }
  }
  return null;
}
