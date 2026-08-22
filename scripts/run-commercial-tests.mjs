#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const results = [];

function run(name, command, args, opts = {}) {
  const started = Date.now();
  const res = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  const ok = res.status === 0;
  results.push({
    name,
    ok,
    ms: Date.now() - started,
    detail: ok ? "" : (res.stderr || res.stdout || "").slice(-800),
  });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name} (${Date.now() - started}ms)\n`);
  if (!ok && res.stdout) process.stdout.write(res.stdout.slice(-1200));
  if (!ok && res.stderr) process.stderr.write(res.stderr.slice(-1200));
  return ok;
}

const unitFiles = readdirSync(join(root, "src/lib"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("src/lib", f))
  .sort();

run("unit:commercial-engines", "node", [
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-alias.mjs",
  "--test",
  ...unitFiles,
]);
run("guard:csp", "node", ["scripts/check-csp.mjs"]);
const hasBuild = existsSync(join(root, ".output/public/assets"));
if (hasBuild) {
  run("guard:preload", "node", ["scripts/check-preload-size.mjs"]);
} else {
  results.push({ name: "guard:preload (skipped — no local vite build)", ok: true, ms: 0, detail: "" });
  process.stdout.write("SKIP  guard:preload (no .output build here)\n");
}
run("live:public-smoke", "node", ["scripts/live-public-smoke.mjs"]);

const failed = results.filter((r) => !r.ok);
console.log("\n=== Commercial readiness summary ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(28)} ${r.ms}ms`);
}
console.log(
  failed.length
    ? `\n${failed.length} check(s) failed.`
    : `\n${results.length} check(s) passed.`,
);
process.exit(failed.length ? 1 : 0);
