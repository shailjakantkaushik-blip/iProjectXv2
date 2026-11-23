/**
 * Print iProjectX sales + user-manual PDFs from HTML.
 * Requires Google Chrome / Chromium on PATH (or CHROME_PATH).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDocs = join(root, "public", "docs");

const chrome =
  process.env.CHROME_PATH ||
  [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
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
  {
    html: join(root, "docs", "sales", "iProjectX-Sales-Pitch.html"),
    pdf: join(root, "docs", "sales", "pdf", "iProjectX-Sales-Pitch.pdf"),
    timeout: "40",
  },
  {
    html: join(root, "docs", "sales", "iProjectX-One-Pager.html"),
    pdf: join(root, "docs", "sales", "pdf", "iProjectX-One-Pager.pdf"),
    timeout: "30",
  },
  {
    html: join(root, "docs", "sales", "iProjectX-Sales-Brochure.html"),
    pdf: join(root, "docs", "sales", "pdf", "iProjectX-Sales-Brochure.pdf"),
    timeout: "30",
  },
  {
    html: join(root, "docs", "sales", "iProjectX-Security-Trust.html"),
    pdf: join(root, "docs", "sales", "pdf", "iProjectX-Security-Trust.pdf"),
    timeout: "30",
  },
  {
    html: join(root, "docs", "sales", "iProjectX-Seller-Playbook.html"),
    pdf: join(root, "docs", "sales", "pdf", "iProjectX-Seller-Playbook.pdf"),
    timeout: "30",
  },
  {
    html: join(root, "docs", "user-manual", "iProjectX-User-Manual.html"),
    pdf: join(root, "docs", "user-manual", "pdf", "iProjectX-User-Manual.pdf"),
    timeout: "60",
  },
];

mkdirSync(join(root, "docs", "sales", "pdf"), { recursive: true });
mkdirSync(join(root, "docs", "user-manual", "pdf"), { recursive: true });
mkdirSync(publicDocs, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "ipx-docs-chrome-"));

for (const job of jobs) {
  const url = pathToFileURL(job.html).href;
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
    `--print-to-pdf=${job.pdf}`,
    url,
  ];
  const run = spawnSync("timeout", [job.timeout, chrome, ...args], { encoding: "utf8" });
  if (!existsSync(job.pdf)) {
    console.error(run.stderr || run.stdout || `Failed ${job.html}`);
    process.exit(run.status || 1);
  }
  const name = job.pdf.split("/").pop();
  const publicFacing = name !== "iProjectX-Seller-Playbook.pdf";
  if (publicFacing) copyFileSync(job.pdf, join(publicDocs, name));
  console.log(`wrote ${name}${publicFacing ? " (+ public/docs)" : " (seller only)"}`);
}

console.log(`PDFs ready in docs/*/pdf and ${publicDocs}`);
