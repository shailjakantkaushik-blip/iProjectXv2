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
  if (/mfa|aal|factor/i.test(hint) || auth.weak_password) {
    fail(`signed-in smoke reached auth but MFA/AAL blocked the session: ${hint}`);
  } else {
    fail(`password grant failed (${authRes.status}): ${hint}`);
  }
  process.exit(1);
}

const token = auth.access_token;
const aal = auth.aal || auth.authenticator_assurance_level || "";
ok(`signed in as ${email}${aal ? ` (${aal})` : ""}`);

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

const projects = await rest("projects", "select=id,project_code,name,status,budget,capex_approved,opex_approved&limit=20");
if (projects.status !== 200 || !Array.isArray(projects.body)) {
  fail(`projects ${projects.status} ${JSON.stringify(projects.body)?.slice(0, 180)}`);
} else if (projects.body.length === 0) {
  fail("signed-in session saw zero projects — check org membership / MFA AAL");
} else {
  const codes = projects.body.map((p) => p.project_code).filter(Boolean);
  const platform = codes.filter((c) => /^PRJ-\d+/.test(c));
  if (!platform.length) fail(`signed-in projects had no PRJ-* codes: ${codes.slice(0, 5).join(", ")}`);
  else ok(`signed-in projects ${projects.body.length} (platform codes ${platform.slice(0, 4).join(", ")}${platform.length > 4 ? "…" : ""})`);
}

for (const table of ["risks", "issues", "actions", "decisions", "fy_allocations", "timesheet_entries", "demand_pipeline", "benefits"]) {
  const { status, body } = await rest(table);
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
