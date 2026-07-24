#!/usr/bin/env node
/**
 * Fail the build if root cold-boot JS grows back into "export mega-chunk" territory.
 * Run after `vite build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = ".output/public/assets";
const BUDGET_BYTES = 850 * 1024; // ~850 KiB for index + supabase + runtime

function pick(dir, re) {
  try {
    return readdirSync(dir)
      .filter((f) => re.test(f))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const assets = [
  ...pick(PUBLIC, /^index-.*\.js$/),
  ...pick(PUBLIC, /^supabase-.*\.js$/),
  ...pick(PUBLIC, /^rolldown-runtime-.*\.js$/),
];

if (assets.length === 0) {
  console.error("check-preload-size: no assets found — run vite build first");
  process.exit(1);
}

let total = 0;
for (const file of assets) {
  const sz = statSync(file).size;
  total += sz;
  console.log(`${(sz / 1024).toFixed(1).padStart(8)} KiB  ${file}`);
}
console.log(`TOTAL root-ish JS: ${(total / 1024).toFixed(1)} KiB (budget ${(BUDGET_BYTES / 1024).toFixed(0)} KiB)`);

const indexFile = assets.find((f) => /index-.*\.js$/.test(f));
if (indexFile) {
  const src = readFileSync(indexFile, "utf8");
  const banned = ["xlsx", "pptxgen", "jspdf", "html2canvas", "html-to-image"];
  const hits = banned.filter((b) => src.includes(b));
  // Dynamic import strings may still mention names — only fail on static from"./…"
  const staticHit = banned.some((b) => new RegExp(`from\\s*[\"'].*${b}`, "i").test(src));
  if (staticHit) {
    console.error("check-preload-size: index still statically imports heavy export libs:", hits);
    process.exit(1);
  }
}

if (total > BUDGET_BYTES) {
  console.error(
    `check-preload-size: FAIL — root JS ${(total / 1024).toFixed(1)} KiB exceeds ${(BUDGET_BYTES / 1024).toFixed(0)} KiB budget`,
  );
  process.exit(1);
}

console.log("check-preload-size: OK");
