/**
 * Print the iProjectX sales PDF pack from the HTML in docs/sales.
 * Requires Google Chrome / Chromium on PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sales = join(root, "docs", "sales");
const outDir = join(sales, "pdf");

const chrome =
  process.env.CHROME_PATH ||
  [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/local/bin/google-chrome",
  ].find((bin) => {
    if (bin.startsWith("/")) return existsSync(bin);
    return spawnSync("which", [bin], { encoding: "utf8" }).status === 0;
  });

if (!chrome) {
  console.error("Chrome/Chromium not found. Set CHROME_PATH.");
  process.exit(1);
}

const jobs = [
  ["iProjectX-Sales-Pitch.html", "iProjectX-Sales-Pitch.pdf"],
  ["iProjectX-One-Pager.html", "iProjectX-One-Pager.pdf"],
  ["iProjectX-Security-Trust.html", "iProjectX-Security-Trust.pdf"],
  ["iProjectX-Seller-Playbook.html", "iProjectX-Seller-Playbook.pdf"],
];

mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "ipx-sales-chrome-"));

for (const [htmlName, pdfName] of jobs) {
  const html = join(sales, htmlName);
  const pdf = join(outDir, pdfName);
  const url = pathToFileURL(html).href;
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-pdf-header-footer",
    "--hide-scrollbars",
    `--print-to-pdf=${pdf}`,
    url,
  ];
  const run = spawnSync("timeout", ["20", chrome, ...args], { encoding: "utf8" });
  if (!existsSync(pdf)) {
    console.error(run.stderr || run.stdout || `Failed ${htmlName}`);
    process.exit(run.status || 1);
  }
  console.log(`wrote ${pdfName}`);
}

console.log(`Sales PDF pack ready in ${outDir}`);
