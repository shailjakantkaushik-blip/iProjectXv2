import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendInvoiceEmailRaw } from "@/lib/invoice-email.server";

/**
 * Cron endpoint: generates due invoices for active subscriptions,
 * marks overdue, then emails all invoices that haven't been emailed yet.
 *
 * Schedule with pg_cron -> POST /api/public/hooks/billing-run
 * Auth: Supabase anon apikey header (checked at the edge). Also accepts a
 * shared BILLING_CRON_SECRET in `x-cron-secret` for calls from outside Supabase.
 */
export const Route = createFileRoute("/api/public/hooks/billing-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.BILLING_CRON_SECRET;
        if (cronSecret) {
          const provided = request.headers.get("x-cron-secret");
          if (provided !== cronSecret) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // 1. Generate any invoices whose subscription period has ended.
        const { error: genErr } = await admin.rpc("generate_due_invoices");
        if (genErr) {
          console.error("generate_due_invoices failed", genErr);
          return Response.json({ error: genErr.message }, { status: 500 });
        }

        // 2. Email invoices that are sent/overdue and not yet emailed.
        const { data: pending, error: pendErr } = await admin
          .from("invoices")
          .select("*, organizations(name, billing_email, brand_name)")
          .in("status", ["sent", "overdue"])
          .is("emailed_at", null)
          .limit(200);

        if (pendErr) {
          return Response.json({ error: pendErr.message }, { status: 500 });
        }

        let sent = 0;
        const failures: Array<{ id: string; error: string }> = [];
        for (const inv of pending ?? []) {
          const org = (inv as any).organizations;
          const to = org?.billing_email;
          if (!to) {
            failures.push({ id: inv.id, error: "no billing_email on organization" });
            await admin
              .from("invoices")
              .update({ email_last_error: "no billing_email on organization" })
              .eq("id", inv.id);
            continue;
          }
          try {
            await sendInvoiceEmailRaw({
              to,
              invoice: inv as any,
              orgName: org?.brand_name || org?.name || "Customer",
            });
            await admin
              .from("invoices")
              .update({ emailed_at: new Date().toISOString(), email_last_error: null })
              .eq("id", inv.id);
            sent++;
          } catch (e: any) {
            failures.push({ id: inv.id, error: e?.message ?? String(e) });
            await admin
              .from("invoices")
              .update({ email_last_error: String(e?.message ?? e).slice(0, 500) })
              .eq("id", inv.id);
          }
        }

        return Response.json({
          ok: true,
          candidates: pending?.length ?? 0,
          sent,
          failures,
        });
      },
    },
  },
});
