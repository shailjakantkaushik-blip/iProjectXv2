import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgDataClient } from "@/lib/byod.server";
import { writeSecurityEvent } from "@/lib/security-audit";

async function assertOrgMember(
  supabase: { from: (t: string) => any },
  userId: string,
  orgId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.org_id !== orgId) throw new Error("Forbidden: organisation mismatch");
}

/** Queue an async org export job (chunked for large tenants). */
export const enqueueOrgExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        kind: z.enum(["org_workbook", "audit_evidence"]).default("org_workbook"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase as any, context.userId, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error } = await (supabaseAdmin as any)
      .from("export_jobs")
      .insert({
        org_id: data.orgId,
        requested_by: context.userId,
        kind: data.kind,
        status: "queued",
        progress_pct: 0,
        meta: { enqueued_via: "enqueueOrgExportJob" },
      })
      .select("id,org_id,kind,status,progress_pct,created_at")
      .single();
    if (error) throw new Error(error.message);

    await writeSecurityEvent({
      orgId: data.orgId,
      actorUserId: context.userId,
      eventType: "admin_action",
      entityType: "export_jobs",
      entityId: job.id,
      summary: `Queued ${data.kind} export job`,
      meta: { job_id: job.id, kind: data.kind },
    });

    return job as {
      id: string;
      org_id: string;
      kind: string;
      status: string;
      progress_pct: number;
      created_at: string;
    };
  });

export const getOrgExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orgId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase as any, context.userId, data.orgId);
    const { data: job, error } = await (context.supabase as any)
      .from("export_jobs")
      .select(
        "id,org_id,kind,status,progress_pct,row_count,result_path,error_message,created_at,started_at,completed_at",
      )
      .eq("id", data.jobId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Export job not found");
    return job;
  });

/**
 * Process one chunk of a queued export job.
 * Uses BYOD-aware data client for tenant tables. Designed for cron / manual drain.
 */
export const processOrgExportJobChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        jobId: z.string().uuid(),
        chunkSize: z.number().int().min(50).max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase as any, context.userId, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chunkSize = data.chunkSize ?? 500;

    const { data: job, error } = await (supabaseAdmin as any)
      .from("export_jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("org_id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Export job not found");
    if (job.status === "completed" || job.status === "cancelled") {
      return { done: true, status: job.status, progress_pct: job.progress_pct };
    }

    const tables = [
      "projects",
      "project_streams",
      "stage_gates",
      "work_items",
      "risks",
      "issues",
      "actions",
      "financials_monthly",
    ];
    const cursorTable = (job.cursor_table as string) || tables[0];
    const cursorOffset = Number(job.cursor_offset) || 0;
    const tableIdx = Math.max(0, tables.indexOf(cursorTable));
    const table = tables[tableIdx] || tables[0];

    if (job.status === "queued") {
      await (supabaseAdmin as any)
        .from("export_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    try {
      const { client } = await resolveOrgDataClient(data.orgId);
      const { data: rows, error: qErr } = await client
        .from(table)
        .select("id")
        .eq("org_id", data.orgId)
        .range(cursorOffset, cursorOffset + chunkSize - 1);
      if (qErr) throw new Error(qErr.message);

      const fetched = (rows ?? []).length;
      const nextOffset = cursorOffset + fetched;
      const exhausted = fetched < chunkSize;
      const nextTableIdx = exhausted ? tableIdx + 1 : tableIdx;
      const done = nextTableIdx >= tables.length;
      const progress = Math.min(
        99,
        Math.round(((tableIdx + (exhausted ? 1 : 0.5)) / tables.length) * 100),
      );

      const patch: Record<string, unknown> = {
        status: done ? "completed" : "running",
        progress_pct: done ? 100 : progress,
        cursor_table: done ? null : tables[nextTableIdx],
        cursor_offset: exhausted ? 0 : nextOffset,
        row_count: Number(job.row_count || 0) + fetched,
        completed_at: done ? new Date().toISOString() : null,
        meta: {
          ...(job.meta || {}),
          last_table: table,
          last_chunk: fetched,
        },
      };

      const { data: updated, error: uErr } = await (supabaseAdmin as any)
        .from("export_jobs")
        .update(patch)
        .eq("id", job.id)
        .select("id,status,progress_pct,row_count,cursor_table,cursor_offset")
        .single();
      if (uErr) throw new Error(uErr.message);

      return { done, ...updated };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Export chunk failed";
      await (supabaseAdmin as any)
        .from("export_jobs")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw new Error(message);
    }
  });
