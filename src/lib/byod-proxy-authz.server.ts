/**
 * Authorization for the BYOD PostgREST proxy.
 * Service-role upstream bypasses customer RLS — this module restores parity with
 * platform controls: AAL2 MFA, role gates, project visibility, timesheet ownership.
 */
import { createClient } from "@supabase/supabase-js";
import type { ByodUpstreamCredentials } from "@/lib/byod.server";

const EDITOR_ROLES = new Set(["admin", "org_admin", "bu_lead", "pm"]);
const ADMIN_ROLES = new Set(["admin", "org_admin"]);

/** Tables keyed by projects.id (filter column `id`). */
const PROJECT_ID_IS_PK = new Set(["projects"]);

/** Tables with project_id FK — inject project_id=in.(visible…). */
const PROJECT_SCOPED_TABLES = new Set([
  "project_streams",
  "stage_gates",
  "milestones",
  "risks",
  "issues",
  "actions",
  "decisions",
  "change_requests",
  "dependencies",
  "benefits",
  "documents",
  "lessons_learned",
  "stakeholders",
  "financials_monthly",
  "sprints",
  "work_items",
  "status_updates",
  "resource_allocations",
  "timesheet_entries",
  "opex_labor_planned",
  "opex_other_costs",
]);

/** Destructive deletes require org admin (mirrors projects_delete_admin etc.). */
const ADMIN_DELETE_TABLES = new Set([
  "projects",
  "business_units",
  "fy_allocations",
  "stage_gate_definitions",
  "portfolio_scenarios",
  "scenario_projects",
]);

const TIMESHEET_OWNER_TABLES = new Set([
  "timesheets",
  "timesheet_approvals",
]);

export type ByodActor = {
  userId: string;
  orgId: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  isPlatformAdmin: boolean;
  aal: string;
  token: string;
};

type VisibilityCfg = {
  rules?: Array<{ role?: string; mode?: string; programs?: string[]; project_ids?: string[] }>;
  user_rules?: Array<{
    user_id?: string;
    mode?: string;
    programs?: string[];
    project_ids?: string[];
  }>;
};

type ProjectRow = {
  id: string;
  program: string | null;
  bu_id: string | null;
  pm_user_id: string | null;
};

const visibleProjectsCache = new Map<
  string,
  { expires: number; ids: string[] | "all" }
>();

export function invalidateByodAuthzCache(userId?: string): void {
  if (!userId) {
    visibleProjectsCache.clear();
    return;
  }
  for (const key of visibleProjectsCache.keys()) {
    if (key.startsWith(`${userId}:`)) visibleProjectsCache.delete(key);
  }
}

function createUserClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Authenticate platform JWT, require AAL2 (MFA), resolve home org + roles.
 */
export async function authenticateByodActor(
  request: Request,
): Promise<ByodActor | Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "Unauthorized");
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) {
    return jsonError(401, "Unauthorized");
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return jsonError(500, "Server misconfigured");
  }

  const userClient = createUserClient(token);
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return jsonError(401, "Unauthorized");
  }

  const claims = claimsData.claims as Record<string, unknown>;
  const userId = String(claims.sub);
  const aal = typeof claims.aal === "string" ? claims.aal : "aal1";

  // Mandatory MFA: reject password-only sessions on this privileged data path.
  if (aal !== "aal2") {
    return jsonError(
      403,
      "Multi-factor authentication required. Complete authenticator MFA before accessing organisation data.",
    );
  }

  const admin = createAdminClient();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("org_id,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profErr || !profile?.org_id) {
    return jsonError(403, "No organisation on profile");
  }
  if ((profile as { is_active?: boolean }).is_active === false) {
    return jsonError(403, "Account inactive");
  }

  const orgId = profile.org_id as string;
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role,org_id")
    .eq("user_id", userId);

  const roles = (roleRows ?? [])
    .filter((r: { role: string; org_id: string | null }) => {
      if (r.role === "platform_admin") return true;
      return r.org_id === orgId;
    })
    .map((r: { role: string }) => r.role);

  const isPlatformAdmin = roles.includes("platform_admin");
  const isAdmin = roles.some((r) => ADMIN_ROLES.has(r));
  const isEditor = roles.some((r) => EDITOR_ROLES.has(r)) || isPlatformAdmin;

  return {
    userId,
    orgId,
    roles,
    isAdmin: isAdmin || isPlatformAdmin,
    isEditor,
    isPlatformAdmin,
    aal,
    token,
  };
}

function methodAllowed(actor: ByodActor, method: string, table: string): Response | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;

  if (m === "DELETE" && ADMIN_DELETE_TABLES.has(table) && !actor.isAdmin) {
    return jsonError(403, "Administrator role required to delete this resource");
  }

  if ((m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE") && !actor.isEditor) {
    // Timesheet owners may write their own sheets without editor role.
    if (TIMESHEET_OWNER_TABLES.has(table) || table === "timesheet_entries") {
      return null;
    }
    return jsonError(403, "Editor role required to modify this resource");
  }

  return null;
}

async function loadOrgVisibility(orgId: string): Promise<VisibilityCfg> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("ui_config")
    .eq("id", orgId)
    .maybeSingle();
  const ui = (data as { ui_config?: { project_visibility?: VisibilityCfg } } | null)?.ui_config;
  return ui?.project_visibility ?? {};
}

async function fetchCustomerProjects(
  upstream: ByodUpstreamCredentials,
): Promise<ProjectRow[]> {
  const url = new URL(`${upstream.baseUrl}/rest/v1/projects`);
  url.searchParams.set("select", "id,program,bu_id,pm_user_id");
  url.searchParams.set("org_id", `eq.${upstream.orgId}`);
  url.searchParams.set("limit", "5000");
  const res = await fetch(url.toString(), {
    headers: {
      apikey: upstream.serviceRoleKey,
      Authorization: `Bearer ${upstream.serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as ProjectRow[];
  return Array.isArray(rows) ? rows : [];
}

function projectVisibleToActor(
  actor: ByodActor,
  project: ProjectRow,
  cfg: VisibilityCfg,
  buIds: Set<string | null>,
): boolean {
  if (actor.isAdmin) return true;
  if (project.pm_user_id === actor.userId) return true;
  if (
    actor.roles.includes("bu_lead") &&
    (buIds.has(null) || (project.bu_id && buIds.has(project.bu_id)))
  ) {
    return true;
  }

  const userRule = (cfg.user_rules ?? []).find((r) => r.user_id === actor.userId);
  if (userRule) {
    const mode = (userRule.mode ?? "all").toLowerCase();
    if (mode === "all" || mode === "") return true;
    if (mode === "programs") {
      const prog = (project.program ?? "").trim().toLowerCase();
      return (userRule.programs ?? []).some((p) => p.trim().toLowerCase() === prog && prog !== "");
    }
    if (mode === "projects") {
      return (userRule.project_ids ?? []).includes(project.id);
    }
    return true;
  }

  const rules = cfg.rules ?? [];
  if (rules.length === 0) return true;

  const roleSet = new Set(actor.roles.map((r) => r.toLowerCase()));
  let matched = false;
  for (const rule of rules) {
    const role = (rule.role ?? "").toLowerCase();
    if (!roleSet.has(role)) continue;
    matched = true;
    const mode = (rule.mode ?? "all").toLowerCase();
    if (mode === "all" || mode === "") return true;
    if (mode === "programs") {
      const prog = (project.program ?? "").trim().toLowerCase();
      if ((rule.programs ?? []).some((p) => p.trim().toLowerCase() === prog && prog !== "")) {
        return true;
      }
    } else if (mode === "projects") {
      if ((rule.project_ids ?? []).includes(project.id)) return true;
    } else {
      return true;
    }
  }
  return !matched;
}

async function resolveVisibleProjectIds(
  actor: ByodActor,
  upstream: ByodUpstreamCredentials,
): Promise<string[] | "all"> {
  if (actor.isAdmin) return "all";

  const cacheKey = `${actor.userId}:${actor.orgId}`;
  const hit = visibleProjectsCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.ids;

  const admin = createAdminClient();
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role,bu_id,org_id")
    .eq("user_id", actor.userId);

  const buIds = new Set<string | null>();
  for (const r of roleRows ?? []) {
    if ((r as { org_id: string | null }).org_id !== actor.orgId) continue;
    if ((r as { role: string }).role === "bu_lead") {
      buIds.add((r as { bu_id: string | null }).bu_id ?? null);
    }
  }

  const cfg = await loadOrgVisibility(actor.orgId);
  const projects = await fetchCustomerProjects(upstream);
  const ids = projects
    .filter((p) => projectVisibleToActor(actor, p, cfg, buIds))
    .map((p) => p.id);

  // Empty restrictive set → use impossible uuid so PostgREST returns nothing (not all rows).
  const result: string[] | "all" = ids;
  visibleProjectsCache.set(cacheKey, { expires: Date.now() + 60_000, ids: result });
  return result;
}

function injectInFilter(url: URL, column: string, ids: string[]): void {
  // Remove conflicting filters on this column
  for (const key of [...url.searchParams.keys()]) {
    if (key === column) url.searchParams.delete(key);
  }
  if (ids.length === 0) {
    // No visible projects — force empty result
    url.searchParams.set(column, "eq.00000000-0000-0000-0000-000000000000");
    return;
  }
  // PostgREST: id=in.(uuid1,uuid2)
  url.searchParams.set(column, `in.(${ids.join(",")})`);
}

function forceTimesheetOwnerScope(actor: ByodActor, table: string, url: URL, method: string): void {
  if (actor.isAdmin) return;
  // PMs / managers still need broader read via approvals — allow editors org-wide read;
  // non-editors only see own sheets.
  if (actor.isEditor && (method === "GET" || method === "HEAD")) return;

  if (table === "timesheets") {
    url.searchParams.delete("user_id");
    url.searchParams.set("user_id", `eq.${actor.userId}`);
  }
  if (table === "timesheet_approvals") {
    // Approvals are joined via timesheet — restrict by leaving org_id only for editors;
    // non-editors should not list all approvals.
    if (!actor.isEditor) {
      url.searchParams.set("approver_user_id", `eq.${actor.userId}`);
    }
  }
}

function forceTimesheetOwnerOnBody(
  actor: ByodActor,
  table: string,
  bodyText: string | null,
  contentType: string | null,
): string | null {
  if (bodyText == null || bodyText === "") return bodyText;
  if (!contentType?.includes("application/json")) return bodyText;
  if (table !== "timesheets") return bodyText;
  if (actor.isAdmin) return bodyText;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (Array.isArray(parsed)) {
      return JSON.stringify(
        parsed.map((row) =>
          row && typeof row === "object"
            ? { ...(row as Record<string, unknown>), user_id: actor.userId }
            : row,
        ),
      );
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify({
        ...(parsed as Record<string, unknown>),
        user_id: actor.userId,
      });
    }
  } catch {
    /* keep */
  }
  return bodyText;
}

/**
 * Enforce method roles + project/timesheet scope on the outbound PostgREST URL/body.
 */
export async function authorizeByodProxyRequest(opts: {
  actor: ByodActor;
  method: string;
  table: string;
  targetUrl: URL;
  bodyText: string | null;
  contentType: string | null;
  upstream: ByodUpstreamCredentials;
}): Promise<{ ok: true; bodyText: string | null } | { ok: false; response: Response }> {
  const denied = methodAllowed(opts.actor, opts.method, opts.table);
  if (denied) return { ok: false, response: denied };

  const method = opts.method.toUpperCase();
  let bodyText = opts.bodyText;

  if (TIMESHEET_OWNER_TABLES.has(opts.table) || opts.table === "timesheet_entries") {
    forceTimesheetOwnerScope(opts.actor, opts.table, opts.targetUrl, method);
    bodyText = forceTimesheetOwnerOnBody(
      opts.actor,
      opts.table,
      bodyText,
      opts.contentType,
    );
  }

  if (
    (PROJECT_ID_IS_PK.has(opts.table) || PROJECT_SCOPED_TABLES.has(opts.table)) &&
    !opts.actor.isAdmin
  ) {
    const visible = await resolveVisibleProjectIds(opts.actor, opts.upstream);
    if (visible !== "all") {
      const col = PROJECT_ID_IS_PK.has(opts.table) ? "id" : "project_id";
      injectInFilter(opts.targetUrl, col, visible);

      // Writes must target a visible project
      if (method !== "GET" && method !== "HEAD" && bodyText && opts.contentType?.includes("json")) {
        try {
          const parsed = JSON.parse(bodyText) as unknown;
          const check = (row: Record<string, unknown>) => {
            const pid = String(
              PROJECT_ID_IS_PK.has(opts.table) ? row.id ?? "" : row.project_id ?? "",
            );
            if (pid && !visible.includes(pid)) {
              throw new Error("forbidden_project");
            }
          };
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              if (row && typeof row === "object") check(row as Record<string, unknown>);
            }
          } else if (parsed && typeof parsed === "object") {
            check(parsed as Record<string, unknown>);
          }
        } catch (e) {
          if (e instanceof Error && e.message === "forbidden_project") {
            return {
              ok: false,
              response: jsonError(403, "Not allowed to access this project"),
            };
          }
        }
      }
    }
  }

  return { ok: true, bodyText };
}

/** Coarse mutation audit (no bodies). */
export async function logByodProxyMutation(opts: {
  actor: ByodActor;
  method: string;
  table: string;
  status: number;
}): Promise<void> {
  const m = opts.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
  try {
    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: opts.actor.orgId,
      actorUserId: opts.actor.userId,
      eventType: "admin_action",
      entityType: "byod_proxy",
      entityId: opts.table,
      summary: `BYOD proxy ${m} ${opts.table} → ${opts.status}`,
      meta: { method: m, table: opts.table, status: opts.status, aal: opts.actor.aal },
    });
  } catch {
    /* non-blocking */
  }
}
