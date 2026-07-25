import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeSecurityEvent } from "@/lib/security-audit";
import { checkRateLimit } from "@/lib/rate-limit";

/** Authenticated login / logout / MFA events with org resolution. */
export const recordAuthSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        eventType: z.enum(["login", "logout", "admin_action"]),
        summary: z.string().min(1).max(500),
        meta: z.record(z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("org_id,email")
      .eq("id", context.userId)
      .maybeSingle();

    await writeSecurityEvent({
      orgId: profile?.org_id,
      actorUserId: context.userId,
      eventType: data.eventType,
      entityType: "auth",
      entityId: context.userId,
      summary: data.summary,
      email: profile?.email ?? null,
      meta: {
        ...(data.meta ?? {}),
      },
    });

    return { ok: true };
  });

/** Failed login attempts (no session) — rate-limited, persisted to security_events. */
export const recordFailedLogin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email().max(320),
        reason: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const key = `failed-login:${email}`;
    const limited = checkRateLimit({ key, limit: 30, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      return { ok: false, throttled: true };
    }

    await writeSecurityEvent({
      eventType: "login_failed",
      entityType: "auth",
      summary: `Failed login for ${email}`,
      email,
      meta: { reason: data.reason ?? "invalid_credentials" },
    });

    return { ok: true, throttled: false };
  });
