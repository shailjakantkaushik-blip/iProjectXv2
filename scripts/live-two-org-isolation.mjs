#!/usr/bin/env node
/**
 * Optional live two-tenant isolation check.
 * Read-only against the foreign org. Skips unless both JWTs (or both
 * email/password pairs) are set. Never writes tenant rows.
 *
 *   IPROJECTX_TEST_JWT_A + IPROJECTX_TEST_JWT_B
 *   or IPROJECTX_TEST_EMAIL_A/PASSWORD_A + EMAIL_B/PASSWORD_B
 */
const HOST = "https://www.iprojectx.com.au";

const jwtA = process.env.IPROJECTX_TEST_JWT_A?.trim();
const jwtB = process.env.IPROJECTX_TEST_JWT_B?.trim();
const emailA = process.env.IPROJECTX_TEST_EMAIL_A?.trim();
const passwordA = process.env.IPROJECTX_TEST_PASSWORD_A;
const emailB = process.env.IPROJECTX_TEST_EMAIL_B?.trim();
const passwordB = process.env.IPROJECTX_TEST_PASSWORD_B;

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

async function passwordGrant(url, key, email, password) {
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
    throw new Error(
      `password grant failed for ${email} (${authRes.status}): ${
        auth.error_description || auth.msg || auth.error || authRes.status
      }`,
    );
  }
  return auth.access_token;
}

if (!jwtA && !jwtB && !(emailA && passwordA && emailB && passwordB)) {
  console.log(
    "SKIP  live two-org isolation (set IPROJECTX_TEST_JWT_A/B or EMAIL/PASSWORD _A and _B)",
  );
  process.exit(0);
}

const { url, key } = await publicSupabase();
const tokenA = jwtA || (await passwordGrant(url, key, emailA, passwordA));
const tokenB = jwtB || (await passwordGrant(url, key, emailB, passwordB));

async function rest(token, path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function homeOrg(token) {
  const { status, body } = await rest(token, "/rest/v1/profiles?select=org_id&limit=1");
  if (status !== 200 || !Array.isArray(body) || !body[0]?.org_id) {
    throw new Error(`could not read home org (${status}) ${JSON.stringify(body)?.slice(0, 180)}`);
  }
  return body[0].org_id;
}

const orgA = await homeOrg(tokenA);
const orgB = await homeOrg(tokenB);
if (orgA === orgB) {
  fail(`both sessions are in the same org ${orgA} — need two tenants`);
  process.exit(1);
}
ok(`two orgs ${orgA.slice(0, 8)}… vs ${orgB.slice(0, 8)}…`);

const projectsB = await rest(
  tokenA,
  `/rest/v1/projects?select=id&org_id=eq.${orgB}&limit=5`,
);
if (projectsB.status !== 200) {
  fail(`A reading B projects: unexpected ${projectsB.status}`);
} else if (Array.isArray(projectsB.body) && projectsB.body.length > 0) {
  fail(`A saw ${projectsB.body.length} of B's projects`);
} else {
  ok("A cannot read B's projects via RLS");
}

async function rpc(token, fn, args) {
  return rest(token, `/rest/v1/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

function denied(label, result) {
  const msg = JSON.stringify(result.body ?? {}).toLowerCase();
  const blocked =
    result.status === 401 ||
    result.status === 403 ||
    result.status === 404 ||
    /not authorized|permission denied|42501|pgrst202|could not find the function/i.test(msg);
  if (blocked) ok(`${label} blocked (${result.status})`);
  else fail(`${label} leaked (${result.status}) ${msg.slice(0, 180)}`);
}

denied("A refresh_org_kpi_summary B", await rpc(tokenA, "refresh_org_kpi_summary", { p_org_id: orgB }));
denied("A sync_org_resources_from_profiles B", await rpc(tokenA, "sync_org_resources_from_profiles", { _org_id: orgB }));
denied("A ensure_org_delivery_methods B", await rpc(tokenA, "ensure_org_delivery_methods", { p_org_id: orgB }));
denied("A seed_default_page_permissions B", await rpc(tokenA, "seed_default_page_permissions", { _org_id: orgB }));
