/**
 * Server-side portfolio queries — pagination, KPI summaries, BYOD-aware client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_PORTFOLIO_SELECT } from "@/lib/project-selects";
import { displayRag } from "@/lib/ops-enhancements";
import { WORK_ITEMS_SELECT } from "@/lib/query-selects";
import { resolveOrgDataClient } from "@/lib/byod.server";
import {
  clampPageSize,
  normalizeOffset,
  toPageResult,
  type JsonRow,
  type PageResult,
} from "@/lib/portfolio-paging";

export type PortfolioProjectFilters = {
  program?: string | null;
  status?: string | null;
  rag?: string | null;
  search?: string | null;
};

export type OrgKpiSummary = {
  org_id: string;
  project_count: number;
  active_count: number;
  rag_green: number;
  rag_amber: number;
  rag_red: number;
  approved_funding: number;
  incurred: number;
  forecast_at_completion: number;
  benefits_target: number;
  benefits_realised: number;
  open_risks: number;
  open_issues: number;
  open_actions: number;
  work_item_total: number;
  work_item_done: number;
  refreshed_at: string;
  mode: "platform" | "byod";
  from_cache: boolean;
};

export type PortfolioProjectStats = {
  total: number;
  active: number;
  completed: number;
  budget_total: number;
  capex_incurred: number;
  by_rag: Record<string, number>;
  by_status: Record<string, number>;
  by_program: Record<string, number>;
  by_priority: Record<string, number>;
  mode: "platform" | "byod";
};

async function assertCallerInOrg(
  userClient: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  const { data, error } = await userClient
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.org_id || data.org_id !== orgId) {
    throw new Error("Forbidden: organisation mismatch");
  }
}

export async function listPortfolioProjectsPage(opts: {
  userClient: SupabaseClient;
  userId: string;
  orgId: string;
  offset?: number;
  limit?: number;
  filters?: PortfolioProjectFilters;
}): Promise<PageResult & { mode: "platform" | "byod" }> {
  await assertCallerInOrg(opts.userClient, opts.userId, opts.orgId);
  const offset = normalizeOffset(opts.offset);
  const limit = clampPageSize(opts.limit);
  const { client, mode } = await resolveOrgDataClient(opts.orgId);
  const db = client as any;

  let q = db
    .from("projects")
    .select(PROJECT_PORTFOLIO_SELECT, { count: "exact" })
    .eq("org_id", opts.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const f = opts.filters ?? {};
  if (f.program && f.program !== "All") q = q.eq("program", f.program);
  if (f.status && f.status !== "All") q = q.eq("status", f.status);
  if (f.rag && f.rag !== "All") {
    const r = String(f.rag).replace(/[^A-Za-z]/g, "");
    if (r) {
      q = q.or(`rag_override.eq.${r},and(rag_override.is.null,rag.eq.${r})`);
    }
  }
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/%/g, "");
    q = q.or(`name.ilike.%${s}%,project_code.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const page = toPageResult((data ?? []) as JsonRow[], count ?? 0, offset, limit);
  return { ...page, mode };
}

export async function getOrgKpiSummary(opts: {
  userClient: SupabaseClient;
  userId: string;
  orgId: string;
  forceRefresh?: boolean;
}): Promise<OrgKpiSummary> {
  await assertCallerInOrg(opts.userClient, opts.userId, opts.orgId);
  const { client, mode } = await resolveOrgDataClient(opts.orgId);
  const db = client as any;

  if (opts.forceRefresh) {
    const { error: refreshErr } = await db.rpc("refresh_org_kpi_summary", {
      p_org_id: opts.orgId,
    });
    if (refreshErr) {
      console.warn("[portfolio] refresh_org_kpi_summary:", refreshErr.message);
    }
  }

  const { data, error } = await db
    .from("org_kpi_summaries")
    .select("*")
    .eq("org_id", opts.orgId)
    .maybeSingle();

  if (!error && data) {
    const row = data as Record<string, unknown>;
    return {
      org_id: opts.orgId,
      project_count: Number(row.project_count) || 0,
      active_count: Number(row.active_count) || 0,
      rag_green: Number(row.rag_green) || 0,
      rag_amber: Number(row.rag_amber) || 0,
      rag_red: Number(row.rag_red) || 0,
      approved_funding: Number(row.approved_funding) || 0,
      incurred: Number(row.incurred) || 0,
      forecast_at_completion: Number(row.forecast_at_completion) || 0,
      benefits_target: Number(row.benefits_target) || 0,
      benefits_realised: Number(row.benefits_realised) || 0,
      open_risks: Number(row.open_risks) || 0,
      open_issues: Number(row.open_issues) || 0,
      open_actions: Number(row.open_actions) || 0,
      work_item_total: Number(row.work_item_total) || 0,
      work_item_done: Number(row.work_item_done) || 0,
      refreshed_at: String(row.refreshed_at || new Date().toISOString()),
      mode,
      from_cache: true,
    };
  }

  // Live fallback when summary table missing / empty.
  const { data: projects, error: pErr } = await client
    .from("projects")
    .select(
      "status,rag,rag_override,budget,capex_approved,opex_approved,capex_incurred,opex_incurred,forecast_at_completion,benefits_target,benefits_realised",
    )
    .eq("org_id", opts.orgId);
  if (pErr) throw new Error(pErr.message);

  let project_count = 0;
  let active_count = 0;
  let rag_green = 0;
  let rag_amber = 0;
  let rag_red = 0;
  let approved_funding = 0;
  let incurred = 0;
  let forecast_at_completion = 0;
  let benefits_target = 0;
  let benefits_realised = 0;

  for (const p of projects ?? []) {
    project_count += 1;
    const st = String((p as any).status || "").toLowerCase();
    if (!/closed|complete|cancelled/.test(st)) active_count += 1;
    const rag = String(displayRag(p as { rag?: string | null; rag_override?: string | null }) || "").toLowerCase();
    if (rag === "green" || rag === "g") rag_green += 1;
    else if (rag === "amber" || rag === "yellow" || rag === "a") rag_amber += 1;
    else if (rag === "red" || rag === "r") rag_red += 1;
    const budget = Number((p as any).budget) || 0;
    const approved =
      budget ||
      (Number((p as any).capex_approved) || 0) + (Number((p as any).opex_approved) || 0);
    approved_funding += approved;
    incurred +=
      (Number((p as any).capex_incurred) || 0) + (Number((p as any).opex_incurred) || 0);
    const fac = Number((p as any).forecast_at_completion) || 0;
    forecast_at_completion += fac || approved;
    benefits_target += Number((p as any).benefits_target) || 0;
    benefits_realised += Number((p as any).benefits_realised) || 0;
  }

  return {
    org_id: opts.orgId,
    project_count,
    active_count,
    rag_green,
    rag_amber,
    rag_red,
    approved_funding,
    incurred,
    forecast_at_completion,
    benefits_target,
    benefits_realised,
    open_risks: 0,
    open_issues: 0,
    open_actions: 0,
    work_item_total: 0,
    work_item_done: 0,
    refreshed_at: new Date().toISOString(),
    mode,
    from_cache: false,
  };
}

export async function getPortfolioProjectStats(opts: {
  userClient: SupabaseClient;
  userId: string;
  orgId: string;
}): Promise<PortfolioProjectStats> {
  await assertCallerInOrg(opts.userClient, opts.userId, opts.orgId);
  const { client, mode } = await resolveOrgDataClient(opts.orgId);
  const { data, error } = await (client as any).rpc("portfolio_project_stats", {
    p_org_id: opts.orgId,
  });

  if (!error && data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    return {
      total: Number(row.total) || 0,
      active: Number(row.active) || 0,
      completed: Number(row.completed) || 0,
      budget_total: Number(row.budget_total) || 0,
      capex_incurred: Number(row.capex_incurred) || 0,
      by_rag: (row.by_rag as Record<string, number>) ?? {},
      by_status: (row.by_status as Record<string, number>) ?? {},
      by_program: (row.by_program as Record<string, number>) ?? {},
      by_priority: (row.by_priority as Record<string, number>) ?? {},
      mode,
    };
  }

  // Fallback: light column scan when RPC not yet applied.
  const { data: rows, error: qErr } = await client
    .from("projects")
    .select("status,rag,rag_override,program,priority,budget,capex_incurred")
    .eq("org_id", opts.orgId);
  if (qErr) throw new Error(error?.message || qErr.message);

  const by_rag: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  const by_program: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  let active = 0;
  let completed = 0;
  let budget_total = 0;
  let capex_incurred = 0;

  for (const p of rows ?? []) {
    const rag = String(displayRag(p as { rag?: string | null; rag_override?: string | null }) || "Unknown").trim() || "Unknown";
    const status = String((p as any).status || "Unknown").trim() || "Unknown";
    const program = String((p as any).program || "Unassigned").trim() || "Unassigned";
    const priority = String((p as any).priority || "Unassigned").trim() || "Unassigned";
    by_rag[rag] = (by_rag[rag] || 0) + 1;
    by_status[status] = (by_status[status] || 0) + 1;
    by_program[program] = (by_program[program] || 0) + 1;
    by_priority[priority] = (by_priority[priority] || 0) + 1;
    if (/in progress/i.test(status)) active += 1;
    if (/^complete/i.test(status)) completed += 1;
    budget_total += Number((p as any).budget) || 0;
    capex_incurred += Number((p as any).capex_incurred) || 0;
  }

  return {
    total: (rows ?? []).length,
    active,
    completed,
    budget_total,
    capex_incurred,
    by_rag,
    by_status,
    by_program,
    by_priority,
    mode,
  };
}

export async function listWorkItemsPage(opts: {
  userClient: SupabaseClient;
  userId: string;
  orgId: string;
  offset?: number;
  limit?: number;
  projectId?: string | null;
  streamId?: string | null;
  stageGateId?: string | null;
  sprintId?: string | null;
  status?: string | null;
}): Promise<PageResult & { mode: "platform" | "byod" }> {
  await assertCallerInOrg(opts.userClient, opts.userId, opts.orgId);
  const offset = normalizeOffset(opts.offset);
  const limit = clampPageSize(opts.limit);
  const { client, mode } = await resolveOrgDataClient(opts.orgId);
  const db = client as any;

  let q = db
    .from("work_items")
    .select(WORK_ITEMS_SELECT, { count: "exact" })
    .eq("org_id", opts.orgId)
    .order("sort_order", { ascending: true })
    .order("planned_end", { ascending: true })
    .range(offset, offset + limit - 1);

  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.streamId) q = q.eq("stream_id", opts.streamId);
  if (opts.stageGateId) q = q.eq("stage_gate_id", opts.stageGateId);
  if (opts.sprintId) q = q.eq("sprint_id", opts.sprintId);
  if (opts.status && opts.status !== "All") q = q.eq("status", opts.status);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    ...toPageResult((data ?? []) as JsonRow[], count ?? 0, offset, limit),
    mode,
  };
}
