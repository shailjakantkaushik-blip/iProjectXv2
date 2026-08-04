import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getOrgKpiSummary,
  getPortfolioProjectStats,
  listPortfolioProjectsPage,
  listWorkItemsPage,
} from "@/lib/portfolio.server";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/portfolio-paging";

const pageSchema = z.object({
  orgId: z.string().uuid(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const getPortfolioKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orgId: z.string().uuid(),
        forceRefresh: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    return getOrgKpiSummary({
      userClient: context.supabase as any,
      userId: context.userId,
      orgId: data.orgId,
      forceRefresh: data.forceRefresh,
    });
  });

export const getPortfolioStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    return getPortfolioProjectStats({
      userClient: context.supabase as any,
      userId: context.userId,
      orgId: data.orgId,
    });
  });

export const listPortfolioProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    pageSchema
      .extend({
        program: z.string().max(200).optional().nullable(),
        status: z.string().max(120).optional().nullable(),
        rag: z.string().max(40).optional().nullable(),
        search: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    return listPortfolioProjectsPage({
      userClient: context.supabase as any,
      userId: context.userId,
      orgId: data.orgId,
      offset: data.offset ?? 0,
      limit: data.limit ?? DEFAULT_PAGE_SIZE,
      filters: {
        program: data.program,
        status: data.status,
        rag: data.rag,
        search: data.search,
      },
    });
  });

export const listPortfolioWorkItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    pageSchema
      .extend({
        projectId: z.string().uuid().optional().nullable(),
        streamId: z.string().uuid().optional().nullable(),
        stageGateId: z.string().uuid().optional().nullable(),
        sprintId: z.string().uuid().optional().nullable(),
        status: z.string().max(80).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    return listWorkItemsPage({
      userClient: context.supabase as any,
      userId: context.userId,
      orgId: data.orgId,
      offset: data.offset ?? 0,
      limit: data.limit ?? DEFAULT_PAGE_SIZE,
      projectId: data.projectId,
      streamId: data.streamId,
      stageGateId: data.stageGateId,
      sprintId: data.sprintId,
      status: data.status,
    });
  });
