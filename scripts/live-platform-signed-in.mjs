#!/usr/bin/env node
/**
 * Optional signed-in smoke against the live iProjectX platform org.
 * Read-only. Skips unless IPROJECTX_TEST_EMAIL and IPROJECTX_TEST_PASSWORD are set.
 * Never writes tenant rows.
 */
const HOST = "https://www.iprojectx.com.au";
const email = process.env.IPROJECTX_TEST_EMAIL?.trim();
const password = process.env.IPROJECTX_TEST_PASSWORD;

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

if (!email || !password) {
  console.log("SKIP  live signed-in platform smoke (set IPROJECTX_TEST_EMAIL and IPROJECTX_TEST_PASSWORD)");
  process.exit(0);
}

const { url, key } = await publicSupabase();
const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});
const auth = await authRes.json().catch(() => ({}));
if (authRes.status !== 200 || !auth.access_token) {
  const hint = String(auth.error_description || auth.msg || auth.error || authRes.status);
  if (/mfa|aal|factor/i.test(JSON.stringify(auth)) || /mfa|aal|factor/i.test(hint)) {
    fail(`password worked far enough to hit MFA — signed-in data checks need an AAL2 session: ${hint}`);
  } else {
    fail(`password grant failed (${authRes.status}): ${hint}`);
  }
  process.exit(1);
}

const token = auth.access_token;
const aal = String(auth.aal || auth.authenticator_assurance_level || "");
ok(`signed in (${aal || "aal unknown"})`);

async function rest(table, qs = "select=*&limit=20") {
  const res = await fetch(`${url}/rest/v1/${table}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const orgs = await rest("organizations", "select=id,name,slug,brand_name&limit=5");
if (orgs.status === 200 && Array.isArray(orgs.body)) {
  const named = orgs.body.map((o) => o.brand_name || o.name || o.slug).filter(Boolean);
  if (!named.length) fail("signed-in session has no organisation row");
  else if (!named.some((n) => /iprojectx/i.test(String(n)))) {
    fail(`signed-in org is not the iProjectX platform tenant: ${named[0]}`);
  } else ok(`platform org visible (${named[0]})`);
} else {
  fail(`organizations ${orgs.status}`);
}

const projects = await rest(
  "projects",
  "select=id,project_code,name,status,budget,capex_approved,opex_approved,capex_incurred,opex_incurred,forecast_at_completion&limit=20",
);
if (projects.status !== 200 || !Array.isArray(projects.body)) {
  fail(`projects ${projects.status} ${JSON.stringify(projects.body)?.slice(0, 180)}`);
} else if (projects.body.length === 0) {
  fail(
    aal === "aal1"
      ? "AAL1 session saw zero projects — MFA challenge is still required"
      : "signed-in session saw zero projects — check org membership",
  );
} else {
  const codes = projects.body.map((p) => p.project_code).filter(Boolean);
  const platform = codes.filter((c) => /^PRJ-\d+/.test(c));
  if (!platform.length) fail(`signed-in projects had no PRJ-* codes: ${codes.slice(0, 5).join(", ")}`);
  else ok(`projects ${projects.body.length} (platform ${platform.slice(0, 4).join(", ")}${platform.length > 4 ? "…" : ""})`);

  const broken = projects.body.filter((p) => {
    const approved = Number(p.budget ?? 0) || Number(p.capex_approved || 0) + Number(p.opex_approved || 0);
    const incurred = Number(p.capex_incurred || 0) + Number(p.opex_incurred || 0);
    return approved > 0 && incurred < 0;
  });
  if (broken.length) fail(`projects with negative incurred: ${broken.map((p) => p.project_code).join(", ")}`);
  else ok("project incurred amounts are non-negative");
}

const leftover = [
  ["risks", "select=id,raid_code,title,status&limit=20"],
  ["issues", "select=id,raid_code,title,status&limit=20"],
  ["actions", "select=id,raid_code,title,status&limit=20"],
  ["decisions", "select=id,raid_code,title,status,outcome&limit=20"],
  ["fy_allocations", "select=id,fy,budget,forecast&limit=20"],
  ["financials_monthly", "select=id,period_month,capex_planned,capex_actual,opex_planned,opex_actual&limit=20"],
  ["timesheets", "select=id,status,week_start&limit=20"],
  ["timesheet_entries", "select=id,timesheet_id,project_id,hours_mon&limit=20"],
  ["demand_pipeline", "select=id,idea_name,status&limit=20"],
  ["benefits", "select=id,target_value,realised_value&limit=20"],
  ["resources", "select=id,name,role,capacity_hours_week&limit=20"],
  ["work_items", "select=id,title,status&limit=20"],
  ["stage_gates", "select=id,gate_name,status&limit=20"],
  ["invoices", "select=id,invoice_number,status,amount_cents&limit=20"],
];

for (const [table, qs] of leftover) {
  const { status, body } = await rest(table, qs);
  if (status === 404) {
    fail(`${table} missing from API (404)`);
    continue;
  }
  if (status !== 200 || !Array.isArray(body)) {
    fail(`${table} ${status}`);
  } else {
    ok(`${table} readable (${body.length} row${body.length === 1 ? "" : "s"} in sample)`);
  }
}

if (process.exitCode) {
  console.error("\nLive signed-in platform smoke failed.");
  process.exit(1);
}
console.log("\nLive signed-in platform smoke passed.");
