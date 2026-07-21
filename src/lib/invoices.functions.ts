import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const emailInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    // Authorization: caller must be a platform admin OR org admin of the invoice's org.
    const { data: isPlatform } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("*, organizations(name, brand_name, billing_email)")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (invErr || !inv) throw new Error(invErr?.message || "Invoice not found");

    if (!isPlatform) {
      const { data: isOrgAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "org_admin",
      });
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("org_id")
        .eq("id", context.userId)
        .maybeSingle();
      if (!isOrgAdmin || !prof || prof.org_id !== (inv as any).org_id) {
        throw new Error("Forbidden");
      }
    }

    const org = (inv as any).organizations;
    const to = org?.billing_email;
    if (!to) throw new Error("Organization has no billing_email set");

    const { data: templateRow } = await supabaseAdmin
      .from("invoice_template_config" as any)
      .select("config")
      .eq("id", "singleton")
      .maybeSingle();
    const { mergeInvoiceTemplate, calcInvoiceGst } = await import(
      "@/lib/invoice-template"
    );
    const template = mergeInvoiceTemplate((templateRow as any)?.config);
    const gst = calcInvoiceGst((inv as any).amount_cents, template);

    const { sendInvoiceEmailRaw } = await import("@/lib/invoice-email.server");
    try {
      await sendInvoiceEmailRaw({
        to,
        invoice: inv as any,
        orgName: org?.brand_name || org?.name || "Customer",
        gst,
      });
    } catch (e: any) {
      await supabaseAdmin
        .from("invoices")
        .update({ email_last_error: String(e?.message ?? e).slice(0, 500) })
        .eq("id", data.invoiceId);
      throw e;
    }

    await supabaseAdmin
      .from("invoices")
      .update({ emailed_at: new Date().toISOString(), email_last_error: null })
      .eq("id", data.invoiceId);

    return { ok: true, to };
  });
