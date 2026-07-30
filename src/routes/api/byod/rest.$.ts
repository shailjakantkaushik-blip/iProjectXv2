/**
 * Same-origin BYOD PostgREST proxy.
 *
 * Browser supabase-js keeps talking to the platform URL for auth + control tables.
 * When organization.byod_active, tenant REST is rewritten here.
 *
 * Security (SOC 2 / ISO access control):
 * - Platform JWT required + AAL2 (mandatory MFA)
 * - Home-org from profiles (not client-supplied)
 * - Role gates + project visibility + timesheet owner scope (service role bypasses RLS)
 * - Mutation audit events
 * - Customer service-role secrets never exposed to the browser
 */
import { createFileRoute } from "@tanstack/react-router";
import { resolveByodUpstream } from "@/lib/byod.server";
import { isByodTenantTable } from "@/lib/byod-tables";
import {
  authenticateByodActor,
  authorizeByodProxyRequest,
  logByodProxyMutation,
} from "@/lib/byod-proxy-authz.server";
import { BYOD_ORG_SCOPED_TABLES } from "@/lib/byod-tables";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** Simple per-user rate limit (best-effort across isolates). */
const rateBuckets = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 240;
const RATE_WINDOW_MS = 60_000;

function rateLimit(userId: string): Response | null {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(userId, { count: 1, reset: now + RATE_WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }
  return null;
}

function forceOrgFilter(target: URL, table: string, orgId: string): void {
  if (!BYOD_ORG_SCOPED_TABLES.has(table)) return;
  for (const key of [...target.searchParams.keys()]) {
    if (key === "org_id") target.searchParams.delete(key);
  }
  target.searchParams.set("org_id", `eq.${orgId}`);
}

async function scopeJsonBody(
  bodyText: string | null,
  contentType: string | null,
  table: string,
  orgId: string,
): Promise<string | null> {
  if (bodyText == null || bodyText === "") return bodyText;
  if (!BYOD_ORG_SCOPED_TABLES.has(table)) return bodyText;
  if (!contentType?.includes("application/json")) return bodyText;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (Array.isArray(parsed)) {
      return JSON.stringify(
        parsed.map((row) =>
          row && typeof row === "object"
            ? { ...(row as Record<string, unknown>), org_id: orgId }
            : row,
        ),
      );
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), org_id: orgId });
    }
  } catch {
    /* leave body as-is if not JSON */
  }
  return bodyText;
}

async function proxyByodRest(
  request: Request,
  splat: string | undefined,
): Promise<Response> {
  const table = (splat ?? "").split("/")[0]?.trim() ?? "";
  if (!table || !/^[a-z][a-z0-9_]*$/i.test(table)) {
    return new Response(JSON.stringify({ message: "Invalid resource" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!isByodTenantTable(table)) {
    return new Response(
      JSON.stringify({ message: "Resource is not BYOD-routable (control plane)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const actorOrErr = await authenticateByodActor(request);
  if (actorOrErr instanceof Response) return actorOrErr;
  const actor = actorOrErr;

  const limited = rateLimit(actor.userId);
  if (limited) return limited;

  const upstream = await resolveByodUpstream(actor.orgId);
  if (!upstream) {
    return new Response(
      JSON.stringify({
        message:
          "BYOD is not active for this organisation — refresh the page or contact a platform admin.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${upstream.baseUrl}/rest/v1/${table}`);
  target.search = incoming.search;
  forceOrgFilter(target, table, actor.orgId);

  const method = request.method.toUpperCase();
  let bodyText: string | null = null;
  const contentType = request.headers.get("content-type");
  if (method !== "GET" && method !== "HEAD") {
    bodyText = await request.text();
    bodyText = await scopeJsonBody(bodyText, contentType, table, actor.orgId);
  }

  const authz = await authorizeByodProxyRequest({
    actor,
    method,
    table,
    targetUrl: target,
    bodyText,
    contentType,
    upstream,
  });
  if (!authz.ok) return authz.response;
  bodyText = authz.bodyText;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "authorization" || lower === "apikey") return;
    if (lower === "cookie") return;
    headers.set(key, value);
  });
  headers.set("apikey", upstream.serviceRoleKey);
  headers.set("Authorization", `Bearer ${upstream.serviceRoleKey}`);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(target.toString(), {
      method,
      headers,
      body: bodyText,
      redirect: "manual",
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "BYOD upstream unavailable. Try again or contact support." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  void logByodProxyMutation({
    actor,
    method,
    table,
    status: upstreamRes.status,
  });

  const outHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    outHeaders.set(key, value);
  });
  outHeaders.delete("access-control-allow-origin");
  outHeaders.delete("access-control-allow-credentials");

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: outHeaders,
  });
}

const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"] as const;

function buildHandlers() {
  const handlers: Record<
    string,
    (ctx: { request: Request; params: { _splat?: string } }) => Promise<Response>
  > = {};
  for (const method of methods) {
    handlers[method] = async ({ request, params }) => {
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            Allow: methods.join(", "),
            "Access-Control-Allow-Methods": methods.join(", "),
            "Access-Control-Allow-Headers":
              "authorization, apikey, content-type, prefer, range, accept, accept-profile, content-profile, x-client-info",
          },
        });
      }
      return proxyByodRest(request, params._splat);
    };
  }
  return handlers;
}

export const Route = createFileRoute("/api/byod/rest/$")({
  server: {
    handlers: buildHandlers(),
  },
});
