export const TURNSTILE_FRAME_PATH = "/turnstile-frame.html";
export const TURNSTILE_FRAME_MESSAGE_SOURCE = "iprojectx-turnstile";

export function turnstileFrameSrc(siteKey: string, size: "normal" | "compact"): string {
  const params = new URLSearchParams({
    k: siteKey,
    size,
  });
  return `${TURNSTILE_FRAME_PATH}?${params.toString()}`;
}

export function readTurnstileFrameToken(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { source?: unknown; token?: unknown };
  if (payload.source !== TURNSTILE_FRAME_MESSAGE_SOURCE) return null;
  return typeof payload.token === "string" ? payload.token : null;
}
