import { getRequest } from "@tanstack/react-start/server";
import { clientKeyFromHeaders } from "@/lib/rate-limit";

/** Server-only. Do not import this file from client-shipped modules at top level. */
export function readClientIpFromRequest(): string | null {
  try {
    const request = getRequest();
    const key = clientKeyFromHeaders(request?.headers ?? null, "");
    return key && key !== "anon" ? key : null;
  } catch {
    return null;
  }
}
