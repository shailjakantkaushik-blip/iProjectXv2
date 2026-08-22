/**
 * In-app commercial suite for platform admins.
 * Reads only the iProjectX organisation. Never queries another tenant's rows.
 */
import { DEMAND_STAGES } from "@/lib/demand-pipeline";
import { fyEnvelopeOverAllocation } from "@/lib/fy-allocation-scope";
import { calcInvoiceGst, DEFAULT_INVOICE_TEMPLATE } from "@/lib/invoice-template";
import { isInvestmentCommitteeForum } from "@/lib/investment-committee";
import { PAGES, resolveCanViewPage } from "@/lib/permissions-acl";
import { PLATFORM_ORG_SLUG, assertPlatformOrgId, isPlatformOrgRow } from "@/lib/platform-org";
import { PLATFORM_SEED_PROJECTS, PLATFORM_WATERFALL_GATES } from "@/lib/platform-seed";
import { projectApprovedFunding, projectIncurred, projectRemaining } from "@/lib/project-finance";
import { isForecastableProjectStatus } from "@/lib/project-forecast";
import { evaluateProjectHealth, scoreToRag } from "@/lib/project-health-engine";
import { RAID_CODE_PREFIX } from "@/lib/raid-code";
import { weekStartMonday } from "@/lib/timesheet";

export const PLATFORM_SUITE_KINDS = [
  {
    id: "e2e",
    label: "End to end",
    blurb: "Walk public and app shells the way a user would, then prove iProjectX data hangs together.",
  },
  {
    id: "functional",
    label: "Functional",
    blurb: "Money, health, RAID, forecast, timesheets, demand, IC, and invoicing rules.",
  },
  {
    id: "system",
    label: "System",
    blurb: "Page shells, platform-org table access, and fail-closed ACL.",
  },
  {
    id: "regression",
    label: "Regression",
    blurb: "Seed invariants and commercial rules that must not drift.",
  },
  {
    id: "performance",
    label: "Performance",
    blurb: "Bounded latency on public pages and iProjectX reads. Not a customer load test.",
  },
  {
    id: "load",
    label: "Load",
    blurb: "Eight parallel public GETs per URL plus four iProjectX project reads. A bounded tick, not a soak.",
  },
  {
    id: "security",
    label: "Security",
    blurb: "Anon RLS and refuse any row outside slug iprojectx.",
  },
] as const;

export type PlatformSuiteKind = (typeof PLATFORM_SUITE_KINDS)[number]["id"];
export const ALL_PLATFORM_SUITE_KINDS = PLATFORM_SUITE_KINDS.map((s) => s.id);

export type PlatformCheckStatus = "pass" | "fail" | "skip";
export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type PlatformCheckResult = {
  id: string;
  suite: PlatformSuiteKind;
  group: string;
  name: string;
  status: PlatformCheckStatus;
  severity: IssueSeverity;
  detail: string;
  ms: number;
};

export type PlatformIssue = {
  id: string;
  severity: IssueSeverity;
  suite: PlatformSuiteKind;
  name: string;
  detail: string;
};

export type PlatformSuiteReport = {
  ranAt: string;
  platformOrg: { id: string; name: string; slug: string };
  origin: string;
  suites: PlatformSuiteKind[];
  passed: number;
  failed: number;
  skipped: number;
  issues: PlatformIssue[];
  issueCounts: Record<IssueSeverity, number>;
  checks: PlatformCheckResult[];
};

export type PlatformSuiteDeps = {
  origin: string;
  suites?: PlatformSuiteKind[];
  resolvePlatformOrg: () => Promise<{ id: string; name: string; slug: string } | null>;
  selectPlatform: (table: string, columns: string, orgId: string, limit?: number) => Promise<unknown[]>;
  restAnon: (table: string) => Promise<{ status: number; body: unknown }>;
  fetchText: (url: string) => Promise<{ status: number; body: string }>;
};

const ANON_HIDDEN_TABLES = [
  "projects",
  "risks",
  "issues",
  "actions",
  "decisions",
  "fy_allocations",
  "financials_monthly",
  "timesheets",
  "timesheet_entries",
  "demand_pipeline",
  "benefits",
  "resources",
  "work_items",
  "stage_gates",
  "invoices",
  "profiles",
] as const;

/** Live select lists must use columns that exist on production. */
export const PLATFORM_TABLES = [
  ["projects", "id,org_id,project_code,name,status,budget,capex_approved,opex_approved,capex_incurred,opex_incurred"],
  ["risks", "id,org_id,raid_code,title,status"],
  ["issues", "id,org_id,raid_code,title,status"],
  ["actions", "id,org_id,raid_code,title,status"],
  ["decisions", "id,org_id,raid_code,title,outcome,status"],
  ["fy_allocations", "id,org_id,fy,budget,forecast"],
  ["financials_monthly", "id,org_id,period_month"],
  ["timesheets", "id,org_id,status,week_start"],
  ["timesheet_entries", "id,org_id,timesheet_id,project_id,hours_mon"],
  ["demand_pipeline", "id,org_id,idea_name,status"],
  ["benefits", "id,org_id,target_value,realised_value"],
  ["resources", "id,org_id,name,role"],
  ["work_items", "id,org_id,title,status"],
  ["stage_gates", "id,org_id,gate_name,status"],
] as const;

const E2E_PUBLIC_PATHS = ["/", "/auth", "/contact"];
const E2E_APP_PATHS = [
  "/app",
  "/app/projects",
  "/app/executive-cockpit",
  "/app/portfolio-pulse",
  "/app/fy-allocation",
  "/app/financials",
  "/app/risks",
  "/app/issues",
  "/app/actions",
  "/app/decisions",
  "/app/timesheets",
  "/app/project-forecast",
  "/app/investment-committee",
  "/app/demand-pipeline",
  "/app/benefits",
  "/app/resources",
  "/app/governance-channels",
  "/platform/testing",
];

const PERF_PATHS = ["/", "/auth", "/contact", "/api/public/landing-logo"];

/** Concurrent GETs per public path. Hard cap so the server function cannot become a self-DoS. */
const LOAD_CONCURRENCY = 8;
const LOAD_P95_PAGE_MS = 5000;
const LOAD_P95_LOGO_MS = 6000;
const LOAD_ORG_READS = 4;
const LOAD_ORG_WALL_MS = 3000;

/** Nearest-rank percentile. `p` is 0–100. */
export function percentile(samples: number[], p: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function wants(selected: Set<PlatformSuiteKind>, kind: PlatformSuiteKind) {
  return selected.has(kind);
}

async function runCheck(
  meta: Omit<PlatformCheckResult, "status" | "detail" | "ms">,
  fn: () => Promise<string> | string,
): Promise<PlatformCheckResult> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { ...meta, status: "pass", detail, ms: Date.now() - started };
  } catch (e) {
    return {
      ...meta,
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
      ms: Date.now() - started,
    };
  }
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function issuesFromChecks(checks: PlatformCheckResult[]): PlatformIssue[] {
  return checks
    .filter((c) => c.status === "fail")
    .map((c) => ({ id: c.id, severity: c.severity, suite: c.suite, name: c.name, detail: c.detail }));
}

export function countIssuesBySeverity(issues: PlatformIssue[]): Record<IssueSeverity, number> {
  const counts: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}

function noTenantLeak(html: string, path: string) {
  must(!/PRJ-00\d|capex_approved|admin@iprojectx/.test(html), `${path} SSR leaked platform tenant fields`);
}

export async function runPlatformCommercialSuite(deps: PlatformSuiteDeps): Promise<PlatformSuiteReport> {
  const selected = new Set(deps.suites?.length ? deps.suites : ALL_PLATFORM_SUITE_KINDS);
  const checks: PlatformCheckResult[] = [];
  const origin = deps.origin.replace(/\/$/, "");
  const hosts = [...new Set([origin, "https://www.iprojectx.com.au", "https://www.iprojectx.com"])];

  if (wants(selected, "functional") || wants(selected, "regression")) {
    checks.push(
      await runCheck(
        {
          id: "engine-seed-remaining",
          suite: wants(selected, "regression") ? "regression" : "functional",
          group: "Money",
          name: "Seed remaining = approved − incurred",
          severity: "critical",
        },
        () => {
          for (const p of PLATFORM_SEED_PROJECTS) {
            const row = {
              budget: p.budget,
              capex_approved: p.capexA,
              opex_approved: p.opexA,
              capex_incurred: p.capexI,
              opex_incurred: p.opexI,
            };
            must(projectApprovedFunding(row) === p.budget, `${p.code} approved`);
            must(projectIncurred(row) === p.capexI + p.opexI, `${p.code} incurred`);
            must(projectRemaining(row) === p.budget - (p.capexI + p.opexI), `${p.code} remaining`);
          }
          return `${PLATFORM_SEED_PROJECTS.length} seed projects`;
        },
      ),
    );
  }

  if (wants(selected, "functional") || wants(selected, "regression")) {
    checks.push(
      await runCheck(
        {
          id: "engine-health-rag",
          suite: "functional",
          group: "Health",
          name: "Health RAG tracks the score",
          severity: "high",
        },
        () => {
          const p = PLATFORM_SEED_PROJECTS[0];
          const result = evaluateProjectHealth({
            nowMs: Date.parse("2026-03-15T00:00:00Z"),
            fyStartMonth: 7,
            project: {
              id: p.code,
              project_code: p.code,
              name: p.name,
              budget: p.budget,
              capex_approved: p.capexA,
              opex_approved: p.opexA,
              capex_incurred: p.capexI,
              opex_incurred: p.opexI,
              forecast_at_completion: p.fac,
              planned_start_date: p.start,
              planned_end_date: p.end,
            },
            workItems: [{ project_id: p.code, estimate_hours: 100, percent_complete: 55, status: "active" }],
          });
          must(result.rag === scoreToRag(result.score), `rag ${result.rag} vs ${result.score}`);
          return `PRJ-001 score ${result.score} ${result.rag}`;
        },
      ),
    );
  }

  if (wants(selected, "regression")) {
    checks.push(
      await runCheck(
        {
          id: "reg-rag-bands",
          suite: "regression",
          group: "Health",
          name: "RAG bands stay 80 Green / 65 Amber",
          severity: "high",
        },
        () => {
          must(scoreToRag(80) === "Green" && scoreToRag(79) === "Amber", "green band");
          must(scoreToRag(65) === "Amber" && scoreToRag(64) === "Red", "amber band");
          return "80+ Green, 65–79 Amber, below 65 Red";
        },
      ),
    );
    checks.push(
      await runCheck(
        {
          id: "reg-fy-cap",
          suite: "regression",
          group: "Money",
          name: "FY allocation cannot exceed the lifetime envelope",
          severity: "critical",
        },
        () => {
          const over = fyEnvelopeOverAllocation({
            allocations: [{ fy: "FY26", budget: 2_000_000 }, { fy: "FY27", budget: 2_000_000 }],
            overallBudget: 3_200_000,
          });
          must(over && over.overBy > 0, "over-allocation not flagged");
          return `over by ${over!.overBy}`;
        },
      ),
    );
    checks.push(
      await runCheck(
        {
          id: "reg-gates",
          suite: "regression",
          group: "Delivery",
          name: "Waterfall gate list matches the platform seed",
          severity: "medium",
        },
        () => {
          must(PLATFORM_WATERFALL_GATES.includes("Business Case / Full Funding"), "funding gate missing");
          must(PLATFORM_WATERFALL_GATES.length === 9, `expected 9 gates, got ${PLATFORM_WATERFALL_GATES.length}`);
          return "9 waterfall gates";
        },
      ),
    );
  }

  if (wants(selected, "functional")) {
    checks.push(
      await runCheck(
        {
          id: "fn-forecast",
          suite: "functional",
          group: "Forecast",
          name: "Completed projects cannot be re-estimated",
          severity: "high",
        },
        () => {
          must(!isForecastableProjectStatus("Completed"), "Completed still forecastable");
          must(isForecastableProjectStatus("In Progress"), "In Progress blocked");
          return "PRJ-012 stays closed to estimation apply";
        },
      ),
    );
    checks.push(
      await runCheck(
        {
          id: "fn-raid-invoice-demand-ic",
          suite: "functional",
          group: "Registers",
          name: "RAID, demand, IC, invoice, timesheet helpers",
          severity: "medium",
        },
        () => {
          must(RAID_CODE_PREFIX.risks === "RSK", "risk prefix");
          must(DEMAND_STAGES[0] === "Idea" && DEMAND_STAGES.includes("Business Case"), "demand stages");
          must(isInvestmentCommitteeForum("Investment Committee"), "IC forum");
          must(DEFAULT_INVOICE_TEMPLATE.company_name === "iProjectX", "invoice brand");
          const gst = calcInvoiceGst(10_000, {
            gst_enabled: true,
            gst_percent: 10,
            gst_label: "GST",
            gst_inclusive: false,
          });
          must(gst.total_cents === 11_000, "GST exclusive");
          must(weekStartMonday(new Date(Date.UTC(2026, 7, 22))) === "2026-08-17", "week start");
          return "helpers stable";
        },
      ),
    );
  }

  if (wants(selected, "system") || wants(selected, "functional")) {
    checks.push(
      await runCheck(
        {
          id: "sys-acl",
          suite: "system",
          group: "Access",
          name: "Page ACL fails closed for viewers",
          severity: "critical",
        },
        () => {
          must(resolveCanViewPage("/app/projects", ["viewer"], []) === false, "viewer open");
          must(resolveCanViewPage("/app/executive-cockpit", ["admin"], []) === true, "admin blocked");
          must(PAGES.length >= 50, `only ${PAGES.length} pages`);
          return `${PAGES.length} catalog pages`;
        },
      ),
    );
  }

  if (wants(selected, "e2e") || wants(selected, "system")) {
    for (const host of hosts) {
      const hostId = host.replace(/^https:\/\//, "");
      for (const path of E2E_PUBLIC_PATHS) {
        checks.push(
          await runCheck(
            {
              id: `e2e-public-${hostId}${path === "/" ? "-home" : path.replace(/\W+/g, "-")}`,
              suite: "e2e",
              group: "Public walk",
              name: `${hostId}${path}`,
              severity: path === "/" ? "critical" : "high",
            },
            async () => {
              const page = await deps.fetchText(`${host}${path}`);
              must(page.status === 200, `status ${page.status}`);
              noTenantLeak(page.body, path);
              if (path === "/") {
                must(page.body.includes("/api/public/landing-logo"), "landing logo img missing");
                must(page.body.includes("landing-nav-open"), "native mobile menu missing");
              }
              return "200 · no tenant SSR leak";
            },
          ),
        );
      }
      checks.push(
        await runCheck(
          {
            id: `e2e-logo-${hostId}`,
            suite: "e2e",
            group: "Public walk",
            name: `${hostId} landing logo bytes`,
            severity: "high",
          },
          async () => {
            const logo = await deps.fetchText(`${host}/api/public/landing-logo`);
            must(logo.status === 200, `status ${logo.status}`);
            return "200";
          },
        ),
      );
    }
  }

  if (wants(selected, "e2e")) {
    for (const path of E2E_APP_PATHS) {
      checks.push(
        await runCheck(
          {
            id: `e2e-app-${path.replace(/\W+/g, "-")}`,
            suite: "e2e",
            group: "App walk",
            name: path,
            severity: path === "/app/projects" || path === "/app/executive-cockpit" ? "high" : "medium",
          },
          async () => {
            const page = await deps.fetchText(`${origin}${path}`);
            must(page.status === 200, `status ${page.status}`);
            noTenantLeak(page.body, path);
            return "SPA shell 200 · no tenant SSR leak";
          },
        ),
      );
    }
  }

  if (wants(selected, "security") || wants(selected, "system")) {
    checks.push(
      await runCheck(
        {
          id: "rls-landing",
          suite: "security",
          group: "Anon RLS",
          name: "landing_config is the public singleton",
          severity: "high",
        },
        async () => {
          const { status, body } = await deps.restAnon("landing_config");
          must(status === 200, `status ${status}`);
          must(Array.isArray(body) && body.length === 1, `expected 1 row, got ${Array.isArray(body) ? body.length : typeof body}`);
          return "1 public row";
        },
      ),
    );
    for (const table of ANON_HIDDEN_TABLES) {
      checks.push(
        await runCheck(
          {
            id: `rls-${table}`,
            suite: "security",
            group: "Anon RLS",
            name: `${table} hidden from anon`,
            severity: "critical",
          },
          async () => {
            const { status, body } = await deps.restAnon(table);
            must(status === 200, `status ${status}`);
            must(Array.isArray(body) && body.length === 0, `leaked ${Array.isArray(body) ? body.length : "non-array"} rows`);
            return "0 rows";
          },
        ),
      );
    }
  }

  const org = await deps.resolvePlatformOrg();
  const needOrg =
    wants(selected, "e2e") ||
    wants(selected, "system") ||
    wants(selected, "security") ||
    wants(selected, "functional") ||
    wants(selected, "performance") ||
    wants(selected, "load");

  if (needOrg) {
    checks.push(
      await runCheck(
        {
          id: "platform-org",
          suite: "security",
          group: "Isolation",
          name: "Resolve iProjectX organisation only",
          severity: "critical",
        },
        () => {
          must(org, `organisation slug=${PLATFORM_ORG_SLUG} not found`);
          must(isPlatformOrgRow(org), "resolved row is not the platform tenant");
          return `${org!.name} (${org!.slug})`;
        },
      ),
    );
  }

  if (org && isPlatformOrgRow(org) && (wants(selected, "e2e") || wants(selected, "system") || wants(selected, "functional"))) {
    for (const [table, columns] of PLATFORM_TABLES) {
      checks.push(
        await runCheck(
          {
            id: `data-${table}`,
            suite: table === "projects" ? "e2e" : "system",
            group: "Platform data",
            name: `${table} in iProjectX only`,
            severity: table === "projects" ? "critical" : "high",
          },
          async () => {
            const rows = (await deps.selectPlatform(table, columns, org.id, 40)) as Array<Record<string, unknown>>;
            for (const row of rows) {
              if (row.org_id) assertPlatformOrgId(String(row.org_id), org.id, table);
            }
            if (table === "projects") {
              const codes = rows.map((r) => String(r.project_code || "")).filter((c) => /^PRJ-\d+/.test(c));
              must(rows.length > 0, "platform org has no projects");
              must(codes.length > 0, "platform projects have no PRJ-* codes");
              return `${rows.length} rows · ${codes.slice(0, 4).join(", ")}${codes.length > 4 ? "…" : ""}`;
            }
            return `${rows.length} row${rows.length === 1 ? "" : "s"} (org-scoped)`;
          },
        ),
      );
    }
  }

  if (org && isPlatformOrgRow(org) && (wants(selected, "e2e") || wants(selected, "functional"))) {
    checks.push(
      await runCheck(
        {
          id: "data-remaining",
          suite: "functional",
          group: "Money",
          name: "Live remaining is not negative",
          severity: "critical",
        },
        async () => {
          const rows = (await deps.selectPlatform(
            "projects",
            "org_id,project_code,budget,capex_approved,opex_approved,capex_incurred,opex_incurred",
            org.id,
            40,
          )) as Array<Record<string, unknown>>;
          for (const row of rows) assertPlatformOrgId(String(row.org_id), org.id, "projects");
          const bad = rows.filter((r) => projectRemaining(r) < -0.01);
          must(bad.length === 0, `negative remaining: ${bad.map((r) => r.project_code).join(", ")}`);
          return `${rows.length} projects checked`;
        },
      ),
    );
  }

  if (wants(selected, "performance")) {
    for (const path of PERF_PATHS) {
      checks.push(
        await runCheck(
          {
            id: `perf-${path === "/" ? "home" : path.replace(/\W+/g, "-")}`,
            suite: "performance",
            group: "Latency",
            name: `Median of 3: ${origin}${path}`,
            severity: "high",
          },
          async () => {
            const samples: number[] = [];
            for (let i = 0; i < 3; i += 1) {
              const t0 = Date.now();
              const page = await deps.fetchText(`${origin}${path}`);
              samples.push(Date.now() - t0);
              must(page.status === 200, `status ${page.status}`);
            }
            const median = [...samples].sort((a, b) => a - b)[1];
            const limit = path.includes("landing-logo") ? 4000 : 3000;
            must(median <= limit, `median ${median}ms exceeds ${limit}ms (${samples.join("/")}ms)`);
            return `median ${median}ms (${samples.join("/")}ms)`;
          },
        ),
      );
    }
    if (org && isPlatformOrgRow(org)) {
      checks.push(
        await runCheck(
          {
            id: "perf-platform-projects",
            suite: "performance",
            group: "Latency",
            name: "iProjectX projects query",
            severity: "medium",
          },
          async () => {
            const t0 = Date.now();
            const rows = await deps.selectPlatform("projects", "id,org_id,project_code", org.id, 40);
            const ms = Date.now() - t0;
            for (const row of rows as Array<Record<string, unknown>>) {
              assertPlatformOrgId(String(row.org_id), org.id, "projects");
            }
            must(ms <= 2500, `query ${ms}ms exceeds 2500ms`);
            return `${ms}ms · ${rows.length} rows`;
          },
        ),
      );
    }
  }

  if (wants(selected, "load")) {
    for (const path of PERF_PATHS) {
      checks.push(
        await runCheck(
          {
            id: `load-${path === "/" ? "home" : path.replace(/\W+/g, "-")}`,
            suite: "load",
            group: "Load tick",
            name: `${LOAD_CONCURRENCY} parallel GETs: ${origin}${path}`,
            severity: "high",
          },
          async () => {
            const wave = await Promise.all(
              Array.from({ length: LOAD_CONCURRENCY }, async () => {
                const t0 = Date.now();
                const page = await deps.fetchText(`${origin}${path}`);
                return { ms: Date.now() - t0, status: page.status };
              }),
            );
            const errors = wave.filter((row) => row.status !== 200);
            must(
              errors.length === 0,
              `${errors.length}/${LOAD_CONCURRENCY} failed · HTTP ${errors[0]?.status}`,
            );
            const samples = wave.map((row) => row.ms);
            const p50 = percentile(samples, 50);
            const p95 = percentile(samples, 95);
            const cap = path.includes("landing-logo") ? LOAD_P95_LOGO_MS : LOAD_P95_PAGE_MS;
            must(p95 <= cap, `p95 ${p95}ms exceeds ${cap}ms (p50 ${p50}ms · worst ${Math.max(...samples)}ms)`);
            return `p50 ${p50}ms · p95 ${p95}ms · worst ${Math.max(...samples)}ms · cap ${cap}ms`;
          },
        ),
      );
    }
    if (org && isPlatformOrgRow(org)) {
      checks.push(
        await runCheck(
          {
            id: "load-platform-projects",
            suite: "load",
            group: "Load tick",
            name: `${LOAD_ORG_READS} parallel iProjectX project reads`,
            severity: "medium",
          },
          async () => {
            const t0 = Date.now();
            const batches = await Promise.all(
              Array.from({ length: LOAD_ORG_READS }, () =>
                deps.selectPlatform("projects", "id,org_id,project_code", org.id, 40),
              ),
            );
            const ms = Date.now() - t0;
            for (const rows of batches) {
              for (const row of rows as Array<Record<string, unknown>>) {
                assertPlatformOrgId(String(row.org_id), org.id, "projects");
              }
            }
            must(ms <= LOAD_ORG_WALL_MS, `${LOAD_ORG_READS} queries ${ms}ms wall exceeds ${LOAD_ORG_WALL_MS}ms`);
            return `${ms}ms wall · ${batches[0]?.length ?? 0} rows each`;
          },
        ),
      );
    }
  }

  const issues = issuesFromChecks(checks);
  return {
    ranAt: new Date().toISOString(),
    platformOrg: org && isPlatformOrgRow(org) ? org : { id: "", name: "unresolved", slug: PLATFORM_ORG_SLUG },
    origin,
    suites: [...selected],
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    skipped: checks.filter((c) => c.status === "skip").length,
    issues,
    issueCounts: countIssuesBySeverity(issues),
    checks,
  };
}
