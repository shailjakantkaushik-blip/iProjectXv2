import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/lib/user-admin.functions";
import { PLATFORM_ORG_SLUG, isPlatformOrgRow } from "@/lib/platform-org";
import {
  ALL_PLATFORM_SUITE_KINDS,
  runPlatformCommercialSuite,
  type PlatformSuiteKind,
  type PlatformSuiteReport,
} from "@/lib/platform-commercial-suite";
import { resolveSupabasePublishableKey, resolveSupabaseUrl } from "@/integrations/supabase/env";

export const runPlatformCommercialTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        origin: z.string().url().max(200),
        suites: z.array(z.enum(ALL_PLATFORM_SUITE_KINDS as [PlatformSuiteKind, ...PlatformSuiteKind[]])).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PlatformSuiteReport> => {
    await assertPlatformAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseUrl = resolveSupabaseUrl();
    const anonKey = resolveSupabasePublishableKey();

    return runPlatformCommercialSuite({
      origin: data.origin.replace(/\/$/, ""),
      suites: data.suites,
      resolvePlatformOrg: async () => {
        const { data: rows, error } = await supabaseAdmin
          .from("organizations")
          .select("id,name,slug")
          .eq("slug", PLATFORM_ORG_SLUG)
          .limit(1);
        if (error) throw new Error(error.message);
        const row = (rows ?? [])[0] ?? null;
        if (!row || !isPlatformOrgRow(row)) return null;
        return { id: row.id, name: row.name, slug: row.slug };
      },
      selectPlatform: async (table, columns, orgId, limit = 40) => {
        if (!orgId) throw new Error("refused query without platform org id");
        const { data: rows, error } = await (supabaseAdmin as any)
          .from(table)
          .select(columns)
          .eq("org_id", orgId)
          .limit(limit);
        if (error) throw new Error(error.message);
        return rows ?? [];
      },
      restAnon: async (table) => {
        if (!supabaseUrl || !anonKey) throw new Error("public Supabase config missing on server");
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=5`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body };
      },
      fetchText: async (url) => {
        const res = await fetch(url, {
          redirect: "follow",
          headers: { "Cache-Control": "no-cache" },
        });
        const body = await res.text();
        return { status: res.status, body };
      },
    });
  });
