import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimitDurable, clientKeyFromHeaders } from "@/lib/rate-limit";
import { resolveOrgDataClient } from "@/lib/byod.server";
import { decryptIntegrationSecret } from "@/lib/integration-crypto.server";

/**
 * Inbound custom webhook for demand intake.
 * POST /api/public/hooks/integration-webhook?org=<uuid>
 * Header: x-webhook-secret: <token matching org_integrations.custom_webhook secret>
 * Body JSON: { title, description?, external_id?, status? }
 */
export const Route = createFileRoute("/api/public/hooks/integration-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const orgId = url.searchParams.get("org");
        if (!orgId) {
          return Response.json({ error: "org query param required" }, { status: 400 });
        }

        const limited = await checkRateLimitDurable({
          key: `webhook:${orgId}:${clientKeyFromHeaders(request.headers)}`,
          limit: 60,
          windowMs: 60_000,
        });
        if (!limited.ok) {
          return Response.json(
            { error: "rate_limited", retry_after_sec: limited.retryAfterSec },
            { status: 429 },
          );
        }

        const provided = request.headers.get("x-webhook-secret") || "";
        if (!provided) {
          return Response.json({ error: "x-webhook-secret required" }, { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: row, error: rowErr } = await admin
          .from("org_integrations")
          .select("*")
          .eq("org_id", orgId)
          .eq("provider", "custom_webhook")
          .maybeSingle();
        if (rowErr || !row) {
          return Response.json({ error: "Webhook not configured" }, { status: 404 });
        }
        if (!(row as any).enabled || (row as any).status === "error") {
          return Response.json({ error: "Webhook disabled" }, { status: 403 });
        }
        if (!(row as any).secret_configured || !(row as any).secret_ciphertext) {
          return Response.json({ error: "Webhook secret missing" }, { status: 403 });
        }

        let secret: string;
        try {
          secret = decryptIntegrationSecret(
            (row as any).secret_ciphertext,
            (row as any).secret_nonce,
          );
        } catch {
          return Response.json({ error: "Secret decrypt failed" }, { status: 500 });
        }
        if (provided !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const title = String(body?.title || body?.summary || "").trim();
        if (!title) {
          return Response.json({ error: "title required" }, { status: 400 });
        }
        const externalId = String(body?.external_id || body?.id || crypto.randomUUID());
        const description = body?.description ? String(body.description).slice(0, 4000) : null;

        const { client } = await resolveOrgDataClient(orgId);
        const ideaTitle = `[WH] ${title}`.slice(0, 240);

        const { data: existingLink } = await admin
          .from("integration_external_links")
          .select("id,local_id")
          .eq("org_id", orgId)
          .eq("provider", "custom_webhook")
          .eq("external_id", externalId)
          .maybeSingle();

        let localId = (existingLink as any)?.local_id as string | undefined;
        if (localId) {
          await client
            .from("demand_pipeline")
            .update({
              title: ideaTitle,
              description,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", localId)
            .eq("org_id", orgId);
        } else {
          const { data: inserted, error: insErr } = await client
            .from("demand_pipeline")
            .insert({
              org_id: orgId,
              title: ideaTitle,
              description,
              status: "Idea",
              sponsor: "Webhook",
            } as never)
            .select("id")
            .maybeSingle();
          if (insErr) {
            return Response.json({ error: insErr.message }, { status: 500 });
          }
          localId = (inserted as any)?.id;
          if (localId) {
            await admin.from("integration_external_links").insert({
              org_id: orgId,
              provider: "custom_webhook",
              external_id: externalId,
              local_table: "demand_pipeline",
              local_id: localId,
              meta: { title },
            } as never);
          }
        }

        await admin
          .from("org_integrations")
          .update({
            last_synced_at: new Date().toISOString(),
            last_error: null,
            status: "active",
          } as never)
          .eq("id", (row as any).id);

        return Response.json({ ok: true, local_id: localId, external_id: externalId });
      },
    },
  },
});
