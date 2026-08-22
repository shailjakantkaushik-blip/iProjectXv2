#!/usr/bin/env node
/**
 * Live iProjectX platform data protection.
 * Uses only the public anon key from the production JS bundle.
 * Tenant tables must return zero rows without a session.
 */
const HOST = "https://www.iprojectx.com.au";

const TENANT_TABLES = [
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
  "hierarchy_envelopes",
  "organizations",
  "profiles",
  "user_roles",
  "role_table_permissions",
  "invoices",
];

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`PASS  ${msg}`);
}

async function publicSupabase() {
  const html = await (await fetch(`${HOST}/`)).text();
  const clientJs = html.match(/\/assets\/client-[^"' ]+\.js/);
  if (!clientJs) throw new Error("client JS chunk not found");
  const js = await (await fetch(`${HOST}${clientJs[0]}`)).text();
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0];
  const key = js.match(/sb_publishable_[A-Za-z0-9._-]+/)?.[0];
  if (!url || !key) throw new Error("public Supabase config not found in client bundle");
  return { url, key };
}

async function rest(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const { url, key } = await publicSupabase();

const landing = await rest(url, key, "landing_config");
if (landing.status !== 200 || !Array.isArray(landing.body) || landing.body.length !== 1) {
  fail(`landing_config should be the public singleton, got ${landing.status} ${JSON.stringify(landing.body)?.slice(0, 120)}`);
} else {
  ok("landing_config is the public marketing singleton");
}

for (const table of TENANT_TABLES) {
  const { status, body } = await rest(url, key, table);
  if (status === 404) {
    fail(`${table} missing from API (404)`);
    continue;
  }
  if (status !== 200) {
    fail(`${table} unexpected status ${status}`);
    continue;
  }
  if (!Array.isArray(body) || body.length !== 0) {
    fail(`${table} leaked ${Array.isArray(body) ? body.length : "non-array"} rows to anon`);
  } else {
    ok(`${table} hidden from anon (0 rows)`);
  }
}

for (const path of ["/app", "/app/projects", "/app/executive-cockpit", "/app/fy-allocation", "/app/risks"]) {
  const html = await (await fetch(`${HOST}${path}`)).text();
  if (/PRJ-00\d|capex_approved|admin@iprojectx/.test(html)) {
    fail(`${path} SSR leaked platform tenant fields`);
  } else {
    ok(`${path} SSR does not embed platform tenant rows`);
  }
}

if (process.exitCode) {
  console.error("\nLive platform RLS smoke failed.");
  process.exit(1);
}
console.log("\nLive platform RLS smoke passed.");
