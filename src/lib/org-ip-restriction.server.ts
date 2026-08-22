import { ipMatchesAllowlist, parseIpAllowlist } from "@/lib/ip-allowlist";
import { writeSecurityEvent } from "@/lib/security-audit";
import { readClientIpFromRequest } from "@/lib/read-client-ip.server";
import type { OrgIpRestrictionResult } from "@/lib/org-ip-restriction.types";

type OrgIpRow = {
  id: string;
  name: string;
  slug: string;
  ip_restriction_enabled: boolean | null;
  ip_allowlist: string[] | null;
};

type RoleQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => {
          limit: (n: number) => Promise<{ data: Array<{ role: string }> | null }>;
        };
      };
    };
  };
};

function readClientIp(): string | null {
  return readClientIpFromRequest();
}

async function isPlatformAdminUser(supabase: RoleQueryClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "platform_admin")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function evaluateOrgIpRestriction(opts: {
  org: OrgIpRow;
  userId: string;
  supabase: RoleQueryClient;
  logDenial: boolean;
}): Promise<OrgIpRestrictionResult> {
  const enabled = Boolean(opts.org.ip_restriction_enabled);
  const clientIp = readClientIp();

  if (!enabled) {
    return { allowed: true, enforced: false, clientIp };
  }

  if (await isPlatformAdminUser(opts.supabase, opts.userId)) {
    return { allowed: true, enforced: true, clientIp };
  }

  const parsed = parseIpAllowlist(opts.org.ip_allowlist ?? []);
  const allowlist = parsed.ok ? parsed.entries : [];

  if (!clientIp) {
    const message =
      "Your organisation restricts sign-in by IP address, but your client IP could not be determined. Contact your administrator.";
    if (opts.logDenial) {
      await writeSecurityEvent({
        orgId: opts.org.id,
        actorUserId: opts.userId,
        eventType: "login_failed",
        entityType: "organizations",
        entityId: opts.org.id,
        summary: `IP restriction denied (unknown client IP) for ${opts.org.name}`,
        meta: { reason: "ip_unknown", org_slug: opts.org.slug },
      });
    }
    return { allowed: false, enforced: true, clientIp: null, message };
  }

  if (allowlist.length === 0 || !ipMatchesAllowlist(clientIp, allowlist)) {
    const message = `Access from your network is not allowed for ${opts.org.name}. Contact your administrator if you need this IP added to the allowlist.`;
    if (opts.logDenial) {
      await writeSecurityEvent({
        orgId: opts.org.id,
        actorUserId: opts.userId,
        eventType: "login_failed",
        entityType: "organizations",
        entityId: opts.org.id,
        summary: `IP restriction denied for ${opts.org.name}`,
        ip: clientIp,
        meta: { reason: "ip_not_allowlisted", org_slug: opts.org.slug },
      });
    }
    return { allowed: false, enforced: true, clientIp, message };
  }

  return { allowed: true, enforced: true, clientIp };
}

export async function assertClientIpAllowedForOrgSlugHandler(opts: {
  slug: string;
  userId: string;
  supabase: RoleQueryClient;
}): Promise<OrgIpRestrictionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const slug = opts.slug.trim();
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, ip_restriction_enabled, ip_allowlist")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !org) {
    return {
      allowed: false,
      enforced: true,
      clientIp: readClientIp(),
      message: "Could not verify IP restriction for this organisation. Try again.",
    };
  }
  return evaluateOrgIpRestriction({
    org: org as OrgIpRow,
    userId: opts.userId,
    supabase: opts.supabase,
    logDenial: true,
  });
}

export async function assertClientIpAllowedForHomeOrgHandler(opts: {
  userId: string;
  supabase: RoleQueryClient;
}): Promise<OrgIpRestrictionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", opts.userId)
    .maybeSingle();
  if (profErr) {
    return {
      allowed: false,
      enforced: true,
      clientIp: readClientIp(),
      message: "Could not verify IP restriction. Try again.",
    };
  }
  if (!profile?.org_id) {
    return { allowed: true, enforced: false, clientIp: readClientIp() };
  }

  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, ip_restriction_enabled, ip_allowlist")
    .eq("id", profile.org_id)
    .maybeSingle();
  if (error || !org) {
    return {
      allowed: false,
      enforced: true,
      clientIp: readClientIp(),
      message: "Could not verify IP restriction for your organisation. Try again.",
    };
  }
  return evaluateOrgIpRestriction({
    org: org as OrgIpRow,
    userId: opts.userId,
    supabase: opts.supabase,
    logDenial: true,
  });
}
