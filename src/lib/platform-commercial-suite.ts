/**
 * In-app commercial suite for platform admins.
 * Reads only the iProjectX organisation. Never queries another tenant's rows.
 */
import { calcInvoiceGst, DEFAULT_INVOICE_TEMPLATE } from "@/lib/invoice-template";
import { PLATFORM_ORG_SLUG, assertPlatformOrgId, isPlatformOrgRow } from "@/lib/platform-org";
import { PLATFORM_SEED_PROJECTS } from "@/lib/platform-seed";
import { projectApprovedFunding, projectIncurred, projectRemaining } from "@/lib/project-finance";
import { evaluateProjectHealth, scoreToRag } from "@/lib/project-health-engine";
import { isForecastableProjectStatus } from "@/lib/project-forecast";
import { RAID_CODE_PREFIX } from "@/lib/raid-code";
import { weekStartMonday } from "@/lib/timesheet";

export type PlatformCheckStatus = "pass" | "fail" | "skip";

export type PlatformCheckResult = {
  id: string;
  group: string;
  name: string;
  status: PlatformCheckStatus;
  detail: string;
  ms: number;
};

export type PlatformSuiteReport = {
  ranAt: string;
  platformOrg: { id: string; name: string; slug: string };
  origin: string;
  passed: number;
  failed: number;
  skipped: number;
  checks: PlatformCheckResult[];
};

export type PlatformSuiteDeps = {
  origin: string;
  resolvePlatformOrg: () => Promise<{ id: string; name: string; slug: string } | null>;
  /** Must always be called with orgId = platform org. */
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
  "timesheet_entries",
  "demand_pipeline",
  "benefits",
  "resources",
  "work_items",
  "stage_gates",
  "invoices",
  "profiles",
] as const;

const PLATFORM_TABLES = [
  ["projects", "id,org_id,project_code,name,status,budget,capex_approved,opex_approved,capex_incurred,opex_incurred"],
  ["risks", "id,org_id,raid_code,title,status"],
  ["issues", "id,org_id,raid_code,title,status"],
  ["actions", "id,org_id,raid_code,title,status"],
  ["decisions", "id,org_id,raid_code,title,outcome,status"],
  ["fy_allocations", "id,org_id,fy,budget,forecast"],
  ["financials_monthly", "id,org_id,period_month"],
  ["timesheet_entries", "id,org_id,status"],
  ["demand_pipeline", "id,org_id,title,status"],
  ["benefits", "id,org_id,target_value,realised_value"],
  ["resources", "id,org_id,name,role"],
  ["work_items", "id,org_id,title,status"],
  ["stage_gates", "id,org_id,gate_name,status"],
] as const;

async function runCheck(
  id: string,
  group: string,
  name: string,
  fn: () => Promise<string> | string,
): Promise<PlatformCheckResult> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { id, group, name, status: "pass", detail, ms: Date.now() - started };
  } catch (e) {
    return {
      id,
      group,
      name,
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
      ms: Date.now() - started,
    };
  }
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export async function runPlatformCommercialSuite(deps: PlatformSuiteDeps): Promise<PlatformSuiteReport> {
  const checks: PlatformCheckResult[] = [];

  checks.push(
    await runCheck("engine-seed-remaining", "Engines", "Seed remaining = approved − incurred", () => {
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
    }),
  );

  checks.push(
    await runCheck("engine-health-rag", "Engines", "Health RAG tracks the score", () => {
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
    }),
  );

  checks.push(
    await runCheck("engine-forecast-complete", "Engines", "Completed seed project is not re-estimated", () => {
      must(!isForecastableProjectStatus("Completed"), "Completed still forecastable");
      must(isForecastableProjectStatus("In Progress"), "In Progress blocked");
      return "PRJ-012 stay closed to estimation apply";
    }),
  );

  checks.push(
    await runCheck("engine-raid-invoice", "Engines", "RAID prefixes and iProjectX invoice GST", () => {
      must(RAID_CODE_PREFIX.risks === "RSK", "risk prefix");
      must(DEFAULT_INVOICE_TEMPLATE.company_name === "iProjectX", "invoice brand");
      const gst = calcInvoiceGst(10_000, { gst_enabled: true, gst_percent: 10, gst_label: "GST", gst_inclusive: false });
      must(gst.total_cents === 11_000, "GST exclusive");
      must(weekStartMonday(new Date(Date.UTC(2026, 7, 22))) === "2026-08-17", "week start");
      return "RSK/ISS/ACT/DEC + 10% GST";
    }),
  );

  const hosts = new Set<string>([
    deps.origin.replace(/\/$/, ""),
    "https://www.iprojectx.com.au",
    "https://www.iprojectx.com",
  ]);
  for (const host of hosts) {
    const hostId = host.replace(/^https:\/\//, "");
    checks.push(
      await runCheck(`public-${hostId}`, "Public", `${hostId} landing + auth + logo`, async () => {
        const home = await deps.fetchText(`${host}/`);
        must(home.status === 200, `home ${home.status}`);
        must(home.body.includes("/api/public/landing-logo"), "landing logo img missing");
        must(home.body.includes("landing-nav-open"), "native mobile menu missing");
        const auth = await deps.fetchText(`${host}/auth`);
        must(auth.status === 200, `auth ${auth.status}`);
        const logo = await deps.fetchText(`${host}/api/public/landing-logo`);
        must(logo.status === 200, `logo ${logo.status}`);
        return "200 on /, /auth, landing-logo";
      }),
    );
  }

  checks.push(
    await runCheck("rls-landing", "Anon RLS", "landing_config is the public singleton", async () => {
      const { status, body } = await deps.restAnon("landing_config");
      must(status === 200, `status ${status}`);
      must(Array.isArray(body) && body.length === 1, `expected 1 row, got ${Array.isArray(body) ? body.length : typeof body}`);
      return "1 public row";
    }),
  );

  for (const table of ANON_HIDDEN_TABLES) {
    checks.push(
      await runCheck(`rls-${table}`, "Anon RLS", `${table} hidden from anon`, async () => {
        const { status, body } = await deps.restAnon(table);
        must(status === 200, `status ${status}`);
        must(Array.isArray(body) && body.length === 0, `leaked ${Array.isArray(body) ? body.length : "non-array"} rows`);
        return "0 rows";
      }),
    );
  }

  const org = await deps.resolvePlatformOrg();
  checks.push(
    await runCheck("platform-org", "Platform data", "Resolve iProjectX organisation only", () => {
      must(org, `organisation slug=${PLATFORM_ORG_SLUG} not found`);
      must(isPlatformOrgRow(org), "resolved row is not the platform tenant");
      return `${org!.name} (${org!.slug})`;
    }),
  );

  if (org && isPlatformOrgRow(org)) {
    for (const [table, columns] of PLATFORM_TABLES) {
      checks.push(
        await runCheck(`data-${table}`, "Platform data", `${table} in iProjectX only`, async () => {
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
        }),
      );
    }

    checks.push(
      await runCheck("data-remaining", "Platform data", "Live remaining is not negative", async () => {
        const rows = (await deps.selectPlatform(
          "projects",
          "org_id,project_code,budget,capex_approved,opex_approved,capex_incurred,opex_incurred",
          org.id,
          40,
        )) as Array<Record<string, unknown>>;
        const bad = rows.filter((r) => projectRemaining(r) < -0.01);
        must(bad.length === 0, `negative remaining: ${bad.map((r) => r.project_code).join(", ")}`);
        return `${rows.length} projects checked`;
      }),
    );
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;

  return {
    ranAt: new Date().toISOString(),
    platformOrg: org && isPlatformOrgRow(org) ? org : { id: "", name: "unresolved", slug: PLATFORM_ORG_SLUG },
    origin: deps.origin,
    passed,
    failed,
    skipped,
    checks,
  };
}
