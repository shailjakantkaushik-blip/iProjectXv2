import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runAlertsDigestJob } from "@/lib/alerts-digest.server";

/**
 * Cron endpoint: RAID auto-escalation + outbound email digests
 * (pending approvals, overdue/escalated RAID, portfolio pulse snapshot).
 *
 * Schedule daily, e.g. pg_cron → POST /api/public/hooks/alerts-digest
 * Auth: x-cron-secret must match ALERTS_CRON_SECRET or BILLING_CRON_SECRET.
 */
export const Route = createFileRoute("/api/public/hooks/alerts-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret =
          process.env.ALERTS_CRON_SECRET || process.env.BILLING_CRON_SECRET;
        if (!cronSecret) {
          console.error(
            "ALERTS_CRON_SECRET / BILLING_CRON_SECRET is not configured — refusing alerts-digest",
          );
          return new Response("Unauthorized", { status: 401 });
        }
        const provided = request.headers.get("x-cron-secret");
        if (provided !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!url || !serviceKey) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        try {
          const result = await runAlertsDigestJob(admin);

          try {
            const { writeSecurityEvent } = await import("@/lib/security-audit");
            await writeSecurityEvent({
              eventType: "alerts_digest",
              entityType: "alerts",
              summary: `Alerts digest emailed ${result.emailed} (skipped ${result.skipped})`,
              meta: {
                emailed: result.emailed,
                skipped: result.skipped,
                failures: result.failures.length,
                escalation: result.escalation,
              },
              ip: request.headers.get("x-forwarded-for"),
              userAgent: request.headers.get("user-agent"),
            });
          } catch {
            /* non-blocking */
          }

          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("alerts-digest failed", e);
          return Response.json(
            { error: e?.message ?? String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
