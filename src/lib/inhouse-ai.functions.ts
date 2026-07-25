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

export const getInhouseAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const cfg = getInhouseAiConfig();
    return {
      configured: cfg.configured,
      label: cfg.label,
      model: cfg.configured ? cfg.model : null,
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
        reason: "not_configured",
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

    // Must be allowed to view the AI page (server-side ACL).
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role,org_id")
      .eq("user_id", context.userId);
    const roles = [...new Set(
      (roleRows ?? [])
        .filter((r: any) => r.org_id == null || r.org_id === profile.org_id)
        .map((r: any) => String(r.role)),
    )];
    const { data: permRows } = await (context.supabase as any)
      .from("role_table_permissions")
      .select("role,table_name,can_view")
      .eq("org_id", profile.org_id);
    const canAi = resolveCanViewPage(
      "/app/ai-assist",
      roles,
      (permRows ?? []) as Array<{ role: string; table_name: string; can_view: boolean }>,
    );
    // Also allow if no explicit deny — resolveCanViewPage already default-allows.
    // Extra guard: if an explicit page::/app/ai-assist deny exists, block.
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
      // Fail soft — client falls back to local engine. Do not leak upstream secrets.
      const message = err instanceof Error ? err.message : "Approved model unavailable";
      return {
        ok: false as const,
        mode: "local" as const,
        reason: "model_error",
        answer: null,
        label: cfg.label,
        error: message.slice(0, 200),
      };
    }
  });
