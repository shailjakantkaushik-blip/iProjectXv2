import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callApprovedModel,
  contextPackForBundle,
  getInhouseAiConfig,
  loadScopedAssistBundleForUser,
} from "@/lib/inhouse-ai.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveCanViewPage } from "@/lib/permissions";
import { assertPlatformAdmin } from "@/lib/user-admin.functions";

async function orgModelEnabled(
  supabase: { from: (t: string) => any },
  orgId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organizations")
    .select("inhouse_ai_model_enabled")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean((data as { inhouse_ai_model_enabled?: boolean } | null)?.inhouse_ai_model_enabled);
}

export const getInhouseAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = getInhouseAiConfig();
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();

    const orgEnabled = profile?.org_id
      ? await orgModelEnabled(context.supabase, profile.org_id)
      : false;

    // Active for this user only when platform endpoint is configured AND org opted in.
    const configured = Boolean(cfg.configured && orgEnabled);

    return {
      configured,
      orgEnabled,
      platformConfigured: cfg.configured,
      label: cfg.label,
      model: configured ? cfg.model : null,
      // Never return base URL or API key to the client.
    };
  });

export const askInhouseAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        question: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const cfg = getInhouseAiConfig();
    if (!cfg.configured) {
      return {
        ok: false as const,
        mode: "local" as const,
        reason: "not_configured" as const,
        answer: null,
        label: cfg.label,
      };
    }

    const limited = checkRateLimit({
      key: `inhouse-ai:${context.userId}`,
      limit: 40,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      throw new Error(
        `Too many In-house AI requests. Try again in ~${limited.retryAfterSec}s.`,
      );
    }

    const { data: profile, error: profileErr } = await context.supabase
      .from("profiles")
      .select("org_id,is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile?.org_id) throw new Error("No organisation on profile");
    if (profile.is_active === false) throw new Error("Account is inactive");

    // Org-level opt-in — default false so customer data stays on the local engine.
    const orgEnabled = await orgModelEnabled(context.supabase, profile.org_id);
    if (!orgEnabled) {
      return {
        ok: false as const,
        mode: "local" as const,
        reason: "org_disabled" as const,
        answer: null,
        label: cfg.label,
      };
    }

    // Must be allowed to view the AI page (server-side ACL).
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role,org_id")
      .eq("user_id", context.userId);
    const roles = [
      ...new Set(
        (roleRows ?? [])
          .filter((r: any) => r.org_id == null || r.org_id === profile.org_id)
          .map((r: any) => String(r.role)),
      ),
    ];
    const { data: permRows } = await (context.supabase as any)
      .from("role_table_permissions")
      .select("role,table_name,can_view")
      .eq("org_id", profile.org_id);
    const canAi = resolveCanViewPage(
      "/app/ai-assist",
      roles,
      (permRows ?? []) as Array<{ role: string; table_name: string; can_view: boolean }>,
    );
    if (!canAi) {
      throw new Error("In-house AI is not permitted for your role in this organisation.");
    }

    const { bundle } = await loadScopedAssistBundleForUser({
      supabase: context.supabase,
      userId: context.userId,
      orgId: profile.org_id,
    });

    const contextPack = contextPackForBundle(bundle);
    try {
      const answer = await callApprovedModel({
        question: data.question,
        contextPack,
      });
      return {
        ok: true as const,
        mode: "approved_model" as const,
        reason: null,
        answer,
        label: cfg.label,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approved model unavailable";
      return {
        ok: false as const,
        mode: "local" as const,
        reason: "model_error" as const,
        answer: null,
        label: cfg.label,
        error: message.slice(0, 200),
      };
    }
  });

/** Platform admin: list orgs + approved-model entitlement. */
export const listOrgInhouseAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = getInhouseAiConfig();
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id,name,slug,plan,inhouse_ai_model_enabled")
      .order("name");
    if (error) throw new Error(error.message);
    return {
      platformConfigured: cfg.configured,
      label: cfg.label,
      model: cfg.configured ? cfg.model : null,
      orgs: (data ?? []).map((o: any) => ({
        id: o.id as string,
        name: o.name as string,
        slug: o.slug as string,
        plan: o.plan as string,
        enabled: Boolean(o.inhouse_ai_model_enabled),
      })),
    };
  });

/** Platform admin: enable/disable approved model for one organisation. */
export const setOrgInhouseAiModelEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .update({ inhouse_ai_model_enabled: data.enabled })
      .eq("id", data.orgId)
      .select("id,name,inhouse_ai_model_enabled")
      .single();
    if (error) throw new Error(error.message);

    const { writeSecurityEvent } = await import("@/lib/security-audit");
    await writeSecurityEvent({
      orgId: data.orgId,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "organizations",
      entityId: data.orgId,
      summary: data.enabled
        ? `Enabled approved In-house AI model for ${org.name}`
        : `Disabled approved In-house AI model for ${org.name}`,
      meta: { inhouse_ai_model_enabled: data.enabled },
    });

    return {
      id: org.id as string,
      enabled: Boolean(org.inhouse_ai_model_enabled),
    };
  });
