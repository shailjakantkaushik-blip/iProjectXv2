import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CLOSED_STATUSES = ["Completed", "Cancelled"] as const;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type PurgeCandidate = {
  id: string;
  org_id: string;
  name: string;
  project_code: string | null;
  status: string;
  closed_on: string;
  program: string | null;
  sponsor: string | null;
};

export type PurgeOrgSummary = {
  org_id: string;
  org_name: string;
  org_slug: string;
  candidate_count: number;
  candidates: PurgeCandidate[];
  pending_notice: PurgeNoticeRow | null;
};

export type PurgeNoticeRow = {
  id: string;
  org_id: string;
  initiated_by: string | null;
  initiator_scope: "platform" | "org";
  status: "pending" | "purged" | "cancelled";
  grace_days: number;
  grace_until: string;
  notified_at: string;
  project_count: number;
  project_ids: string[];
  message: string | null;
  purged_at: string | null;
  purged_by: string | null;
  purged_count: number | null;
  created_at: string;
  org_name?: string;
};

function closedOn(p: {
  actual_end_date?: string | null;
  end_date?: string | null;
  planned_end_date?: string | null;
  updated_at?: string | null;
}): Date {
  const raw = p.actual_end_date || p.end_date || p.planned_end_date || p.updated_at;
  const d = raw ? new Date(raw) : new Date(0);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function isEligible(p: any, cutoff: Date): boolean {
  if (!CLOSED_STATUSES.includes(p.status)) return false;
  return closedOn(p).getTime() < cutoff.getTime();
}

async function loadCallerRoles(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role,org_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { role: string; org_id: string | null }[];
}

async function assertPlatformAdmin(supabase: any, userId: string) {
  const roles = await loadCallerRoles(supabase, userId);
  if (!roles.some((r) => r.role === "platform_admin")) {
    throw new Error("Forbidden: platform_admin only");
  }
}

async function assertOrgAdminForOrg(supabase: any, userId: string, orgId: string) {
  const roles = await loadCallerRoles(supabase, userId);
  if (roles.some((r) => r.role === "platform_admin")) return { platform: true as const };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.org_id !== orgId) throw new Error("Forbidden: not a member of this organisation");

  const ok = roles.some(
    (r) =>
      (r.role === "admin" || r.role === "org_admin") &&
      (r.org_id === orgId || r.org_id == null),
  );
  if (!ok) throw new Error("Forbidden: org admin only");
  return { platform: false as const };
}

async function fetchOrgAdmins(supabaseAdmin: any, orgId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id,role")
    .eq("org_id", orgId)
    .in("role", ["org_admin", "admin"]);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
}

function toCandidate(p: any): PurgeCandidate {
  const d = closedOn(p);
  return {
    id: p.id,
    org_id: p.org_id,
    name: p.name,
    project_code: p.project_code ?? null,
    status: p.status,
    closed_on: d.toISOString().slice(0, 10),
    program: p.program ?? null,
    sponsor: p.sponsor ?? null,
  };
}

async function loadCandidatesForOrg(
  supabaseAdmin: any,
  orgId: string,
): Promise<PurgeCandidate[]> {
  const cutoff = new Date(Date.now() - YEAR_MS);
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select(
      "id,org_id,name,project_code,status,actual_end_date,end_date,planned_end_date,updated_at,program,sponsor",
    )
    .eq("org_id", orgId)
    .in("status", [...CLOSED_STATUSES]);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p: any) => isEligible(p, cutoff)).map(toCandidate);
}

async function latestPendingNotice(
  supabaseAdmin: any,
  orgId: string,
): Promise<PurgeNoticeRow | null> {
  const { data, error } = await supabaseAdmin
    .from("project_purge_notices" as any)
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("grace_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PurgeNoticeRow) ?? null;
}

/** Platform: eligible closed projects grouped by organisation + pending notices */
export const listPlatformPurgeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurgeOrgSummary[]> => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select("id,name,slug")
      .order("name");
    if (error) throw new Error(error.message);

    const out: PurgeOrgSummary[] = [];
    for (const org of orgs ?? []) {
      const candidates = await loadCandidatesForOrg(supabaseAdmin, org.id);
      if (candidates.length === 0) {
        const notice = await latestPendingNotice(supabaseAdmin, org.id);
        if (!notice) continue;
        out.push({
          org_id: org.id,
          org_name: org.name,
          org_slug: org.slug,
          candidate_count: 0,
          candidates: [],
          pending_notice: notice,
        });
        continue;
      }
      out.push({
        org_id: org.id,
        org_name: org.name,
        org_slug: org.slug,
        candidate_count: candidates.length,
        candidates: candidates.slice(0, 50),
        pending_notice: await latestPendingNotice(supabaseAdmin, org.id),
      });
    }
    return out.sort((a, b) => b.candidate_count - a.candidate_count);
  });

/** Org admin: eligible projects + pending notice for caller's org */
export const listOrgPurgeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      org_id: string;
      org_name: string;
      candidates: PurgeCandidate[];
      pending_notice: PurgeNoticeRow | null;
      notices: PurgeNoticeRow[];
    }> => {
      const { data: profile, error } = await context.supabase
        .from("profiles")
        .select("org_id")
        .eq("id", context.userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!profile?.org_id) throw new Error("No organisation");

      await assertOrgAdminForOrg(context.supabase, context.userId, profile.org_id);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: org, error: oErr } = await supabaseAdmin
        .from("organizations")
        .select("id,name")
        .eq("id", profile.org_id)
        .single();
      if (oErr) throw new Error(oErr.message);

      const candidates = await loadCandidatesForOrg(supabaseAdmin, profile.org_id);
      const pending_notice = await latestPendingNotice(supabaseAdmin, profile.org_id);

      const { data: notices, error: nErr } = await supabaseAdmin
        .from("project_purge_notices" as any)
        .select("*")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (nErr) throw new Error(nErr.message);

      return {
        org_id: org.id,
        org_name: org.name,
        candidates,
        pending_notice,
        notices: (notices as unknown as PurgeNoticeRow[]) ?? [],
      };
    },
  );

/** Notify org admins and open a grace window (platform or org admin). */
export const createPurgeNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        grace_days: z.number().int().min(1).max(90).default(14),
        message: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdminForOrg(context.supabase, context.userId, data.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const roles = await loadCallerRoles(context.supabase, context.userId);
    const isPlatform = roles.some((r) => r.role === "platform_admin");
    const initiator_scope: "platform" | "org" = isPlatform ? "platform" : "org";

    const existing = await latestPendingNotice(supabaseAdmin, data.org_id);
    if (existing) {
      throw new Error(
        `A pending purge notice already exists (grace until ${new Date(existing.grace_until).toLocaleDateString()}). Cancel it first or wait for purge.`,
      );
    }

    const candidates = await loadCandidatesForOrg(supabaseAdmin, data.org_id);
    if (candidates.length === 0) {
      throw new Error("No closed projects older than 1 year to purge in this organisation.");
    }

    const grace_until = new Date(Date.now() + data.grace_days * 24 * 60 * 60 * 1000).toISOString();
    const msg =
      data.message?.trim() ||
      (initiator_scope === "platform"
        ? `Platform administration requested cleanup of ${candidates.length} closed project(s) older than 1 year. Please review and purge before ${new Date(grace_until).toLocaleDateString()}, or platform admins may complete the purge after the grace period.`
        : `Organisation administration scheduled cleanup of ${candidates.length} closed project(s) older than 1 year. Grace until ${new Date(grace_until).toLocaleDateString()}.`);

    const { data: notice, error } = await supabaseAdmin
      .from("project_purge_notices" as any)
      .insert({
        org_id: data.org_id,
        initiated_by: context.userId,
        initiator_scope,
        status: "pending",
        grace_days: data.grace_days,
        grace_until,
        project_count: candidates.length,
        project_ids: candidates.map((c) => c.id),
        message: msg,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const admins = await fetchOrgAdmins(supabaseAdmin, data.org_id);
    if (admins.length) {
      const rows = admins.map((user_id) => ({
        user_id,
        org_id: data.org_id,
        kind: "project_purge_notice",
        title: "Action required: closed project purge",
        body: msg,
        link: "/app/project-purge",
      }));
      const { error: nErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (nErr) throw new Error(nErr.message);
    }

    return { notice: notice as unknown as PurgeNoticeRow, notified_admins: admins.length };
  });

/** Cancel a pending notice (platform or org admin for that org). */
export const cancelPurgeNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ notice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notice, error } = await supabaseAdmin
      .from("project_purge_notices" as any)
      .select("*")
      .eq("id", data.notice_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!notice) throw new Error("Notice not found");
    const row = notice as unknown as PurgeNoticeRow;
    if (row.status !== "pending") throw new Error("Only pending notices can be cancelled");

    await assertOrgAdminForOrg(context.supabase, context.userId, row.org_id);

    const { error: uErr } = await supabaseAdmin
      .from("project_purge_notices" as any)
      .update({ status: "cancelled" })
      .eq("id", row.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

/**
 * Execute purge of currently eligible closed projects for an org.
 * - Org admin: always allowed for their org (direct capability).
 * - Platform admin: allowed only when a pending notice exists and grace_until has passed,
 *   OR when executing after org-initiated notice expired; if no notice, must create notice first.
 */
export const executeProjectPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        /** Optional: purge only these ids (must still be eligible). */
        project_ids: z.array(z.string().uuid()).optional(),
        confirm: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const auth = await assertOrgAdminForOrg(context.supabase, context.userId, data.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roles = await loadCallerRoles(context.supabase, context.userId);
    const isPlatform = roles.some((r) => r.role === "platform_admin");

    const pending = await latestPendingNotice(supabaseAdmin, data.org_id);

    if (isPlatform && auth.platform) {
      // Platform may purge only after grace on a pending notice
      if (!pending) {
        throw new Error(
          "Notify the organisation admin first and wait for the grace period before platform purge.",
        );
      }
      if (new Date(pending.grace_until).getTime() > Date.now()) {
        throw new Error(
          `Grace period active until ${new Date(pending.grace_until).toLocaleString()}. Org admins can purge sooner from Project purge.`,
        );
      }
    }
    // Org admins can purge anytime (with confirm) for their org

    const candidates = await loadCandidatesForOrg(supabaseAdmin, data.org_id);
    let ids = candidates.map((c) => c.id);
    if (data.project_ids?.length) {
      const allow = new Set(ids);
      ids = data.project_ids.filter((id) => allow.has(id));
    }
    if (ids.length === 0) throw new Error("No eligible projects to purge.");

    // Snapshot for audit before delete
    const snapshot = candidates.filter((c) => ids.includes(c.id));

    const { error: delErr } = await supabaseAdmin.from("projects").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);

    if (pending) {
      await supabaseAdmin
        .from("project_purge_notices" as any)
        .update({
          status: "purged",
          purged_at: new Date().toISOString(),
          purged_by: context.userId,
          purged_count: ids.length,
        })
        .eq("id", pending.id);
    } else {
      // Record a completed notice for audit trail when org admin purges directly
      await supabaseAdmin.from("project_purge_notices" as any).insert({
        org_id: data.org_id,
        initiated_by: context.userId,
        initiator_scope: isPlatform ? "platform" : "org",
        status: "purged",
        grace_days: 1,
        grace_until: new Date().toISOString(),
        notified_at: new Date().toISOString(),
        project_count: ids.length,
        project_ids: ids,
        message: "Direct purge by organisation administrator (no prior grace notice).",
        purged_at: new Date().toISOString(),
        purged_by: context.userId,
        purged_count: ids.length,
      });
    }

    await supabaseAdmin.from("audit_events" as any).insert({
      org_id: data.org_id,
      actor_user_id: context.userId,
      entity_type: "project_purge",
      entity_id: pending?.id ?? null,
      action: "purged",
      summary: `Purged ${ids.length} closed project(s) older than 1 year`,
      meta: {
        count: ids.length,
        projects: snapshot.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.project_code,
          status: p.status,
          closed_on: p.closed_on,
        })),
        by_platform: isPlatform && auth.platform,
      },
    });

    return { purged: ids.length, project_ids: ids };
  });
