/**
 * Browser-only BYOD routing for supabase-js REST calls.
 * When active, tenant-table requests are rewritten to same-origin
 * `/api/byod/rest/...` so the server can forward with the customer service role.
 *
 * Auth, storage, and control-plane tables always stay on the platform URL.
 * Flag is window-only — never enable rewrite during SSR (avoids cross-request leaks).
 */
import { isByodTenantTable, parseRestV1Resource } from "@/lib/byod-tables";

let byodRoutingActive = false;

export function setByodClientRoutingActive(active: boolean): void {
  if (typeof window === "undefined") {
    byodRoutingActive = false;
    return;
  }
  byodRoutingActive = Boolean(active);
}

export function isByodClientRoutingActive(): boolean {
  return typeof window !== "undefined" && byodRoutingActive;
}

/**
 * If this request should go through the BYOD proxy, return the rewritten URL string.
 * Otherwise return null (caller keeps the original platform URL).
 */
export function maybeRewriteByodRestUrl(
  inputUrl: string,
  platformSupabaseUrl: string,
): string | null {
  if (!isByodClientRoutingActive()) return null;

  let url: URL;
  try {
    url = new URL(inputUrl, typeof window !== "undefined" ? window.location.origin : undefined);
  } catch {
    return null;
  }

  let platform: URL;
  try {
    platform = new URL(platformSupabaseUrl);
  } catch {
    return null;
  }

  // Only rewrite calls aimed at the platform Supabase REST API.
  if (url.origin !== platform.origin) return null;
  if (!url.pathname.includes("/rest/v1/")) return null;

  const resource = parseRestV1Resource(url.pathname);
  if (!resource || resource.kind !== "table") return null;
  if (!isByodTenantTable(resource.name)) return null;

  const proxyPath = `/api/byod/rest/${resource.name}`;
  return `${proxyPath}${url.search}`;
}
