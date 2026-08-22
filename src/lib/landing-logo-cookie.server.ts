import { parseLandingLogoCookie } from "@/lib/landing-logo-cookie";

/** Server-only. Import only from SSR loaders via dynamic import. */
export async function readLandingLogoCookieFromRequest(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    return parseLandingLogoCookie(getRequest()?.headers?.get("cookie") ?? "");
  } catch {
    return "";
  }
}
