import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeSecurityEvent } from "@/lib/security-audit";

const EoiSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  organization_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  job_title: z.string().trim().max(120).optional().nullable(),
  company_size: z.string().trim().max(80).optional().nullable(),
  interest_areas: z.string().trim().max(500).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
  source: z.string().trim().max(80).default("landing"),
});

/** Public EOI submit — validated + rate-limited; writes via service role (no open anon INSERT). */
export const submitEoiRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => EoiSchema.parse(d))
  .handler(async ({ data }) => {
    const key = `eoi:${data.email.toLowerCase()}`;
    const limited = checkRateLimit({ key, limit: 5, windowMs: 60 * 60 * 1000 });
    if (!limited.ok) {
      throw new Error(`Too many submissions. Try again in ${limited.retryAfterSec}s.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Table exists in migrations; generated Database types lag behind newer tables.
    const { error } = await (supabaseAdmin as any).from("eoi_requests").insert({
      full_name: data.full_name,
      email: data.email,
      organization_name: data.organization_name || null,
      phone: data.phone || null,
      job_title: data.job_title || null,
      company_size: data.company_size || null,
      interest_areas: data.interest_areas || null,
      message: data.message || null,
      source: data.source || "landing",
    });
    if (error) throw new Error(error.message);

    await writeSecurityEvent({
      eventType: "eoi_submit",
      entityType: "eoi_requests",
      summary: `EOI submitted by ${data.email}`,
      meta: { email: data.email, source: data.source },
    });

    return { ok: true };
  });
