#!/usr/bin/env node
/**
 * Live public-surface smoke for commercial launch.
 * Hits production hosts only — no auth, no tenant data.
 */
const HOSTS = ["https://www.iprojectx.com.au", "https://www.iprojectx.com"];
const PATHS = ["/", "/auth", "/contact", "/api/public/landing-logo"];

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`PASS  ${msg}`);
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  const body = await res.text();
  return { res, body };
}

async function checkHost(host) {
  const home = await fetchText(`${host}/`);
  if (home.res.status !== 200) fail(`${host}/ status ${home.res.status}`);
  else ok(`${host}/ 200`);

  if (
    !home.body.includes('src="/brand/landing.webp"') &&
    !home.body.includes('src="/api/public/landing-logo"')
  ) {
    fail(`${host}/ first HTML missing landing-logo img`);
  } else ok(`${host}/ landing-logo img`);

  if (!home.body.includes("landing-nav-open")) {
    fail(`${host}/ first HTML missing native mobile menu`);
  } else ok(`${host}/ native mobile menu`);

  const smallDefault = /style="height:32px;max-width:160px/.test(home.body);
  if (smallDefault && !/height:10[0-9]px/.test(home.body)) {
    fail(`${host}/ still painting default 32px header mark only`);
  } else ok(`${host}/ configured logo size in first HTML`);

  const auth = await fetchText(`${host}/auth`);
  if (auth.res.status !== 200) fail(`${host}/auth status ${auth.res.status}`);
  else ok(`${host}/auth 200`);

  const contact = await fetchText(`${host}/contact`);
  if (contact.res.status !== 200) fail(`${host}/contact status ${contact.res.status}`);
  else ok(`${host}/contact 200`);

  const logo = await fetch(`${host}/api/public/landing-logo`, { redirect: "follow" });
  const type = logo.headers.get("content-type") || "";
  if (logo.status !== 200 || !type.startsWith("image/")) {
    fail(`${host}/api/public/landing-logo ${logo.status} ${type}`);
  } else ok(`${host}/api/public/landing-logo ${type} (checkpoint)`);

  const brand = await fetch(`${host}/brand/landing.webp`, { redirect: "follow" });
  const brandType = brand.headers.get("content-type") || "";
  if (brand.status !== 200 || !brandType.startsWith("image/")) {
    fail(`${host}/brand/landing.webp ${brand.status} ${brandType}`);
  } else ok(`${host}/brand/landing.webp ${brandType}`);
}

for (const host of HOSTS) {
  await checkHost(host);
}

if (process.exitCode) {
  console.error(`\nLive smoke failed (${PATHS.join(", ")}).`);
  process.exit(1);
}
console.log("\nLive public smoke passed.");
