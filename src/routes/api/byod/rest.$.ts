/**
 * Same-origin BYOD PostgREST proxy.
 *
 * Browser supabase-js keeps talking to the platform URL for auth + control tables.
 * When organization.byod_active, tenant REST is rewritten here; we verify the
 * platform JWT, resolve the customer upstream (cached), force org_id scope, and
 * forward with the customer service-role key (never exposed to the browser).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveByodUpstream } from "@/lib/byod.server";
import {
  BYOD_ORG_SCOPED_TABLES,
  isByodTenantTable,
} from "@/lib/byod-tables";

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

async function authenticatePlatformUser(
  request: Request,
): Promise<{ userId: string; orgId: string } | Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !service) {
    return new Response(JSON.stringify({ message: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("org_id,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profErr || !profile?.org_id) {
    return new Response(JSON.stringify({ message: "No organisation on profile" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if ((profile as { is_active?: boolean }).is_active === false) {
    return new Response(JSON.stringify({ message: "Account inactive" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { userId: userData.user.id, orgId: profile.org_id as string };
}

function forceOrgFilter(target: URL, table: string, orgId: string): void {
  if (!BYOD_ORG_SCOPED_TABLES.has(table)) return;
  for (const key of [...target.searchParams.keys()]) {
    if (key === "org_id" || key.startsWith("and") || key.startsWith("or")) {
      // Keep and/or — PostgREST AND with top-level org_id=eq still applies.
      // Strip only direct org_id overrides.
    }
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

  const auth = await authenticatePlatformUser(request);
  if (auth instanceof Response) return auth;

  const upstream = await resolveByodUpstream(auth.orgId);
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
  forceOrgFilter(target, table, auth.orgId);

  const method = request.method.toUpperCase();
  let bodyText: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    bodyText = await request.text();
    bodyText = await scopeJsonBody(
      bodyText,
      request.headers.get("content-type"),
      table,
      auth.orgId,
    );
  }

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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upstream fetch failed";
    return new Response(JSON.stringify({ message: `BYOD upstream error: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const outHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    outHeaders.set(key, value);
  });
  // Avoid leaking customer project URL via CORS-like headers
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
  const handlers: Record<string, (ctx: { request: Request; params: { _splat?: string } }) => Promise<Response>> =
    {};
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
