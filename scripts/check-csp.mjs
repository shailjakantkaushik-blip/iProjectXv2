#!/usr/bin/env node
/**
 * Guard the static Vercel CSP.
 *
 * TanStack Start SSR emits inline <script> tags for hydration (`self.$_TSR`)
 * and scroll restoration. A static Content-Security-Policy in vercel.json
 * cannot carry a per-request nonce, so script-src MUST allow 'unsafe-inline'
 * or the public landing hydrates into a blank page (Invariant failed).
 *
 * Do not drop 'unsafe-inline' unless CSP is moved to per-request middleware
 * with router ssr.nonce on every framework script.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

const csp = vercel?.headers
  ?.flatMap((h) => h.headers ?? [])
  ?.find((h) => h.key === "Content-Security-Policy")?.value;

if (!csp || typeof csp !== "string") {
  console.error("check-csp: missing Content-Security-Policy in vercel.json");
  process.exit(1);
}

const scriptSrc = csp
  .split(";")
  .map((d) => d.trim())
  .find((d) => d.startsWith("script-src "));

if (!scriptSrc) {
  console.error("check-csp: CSP has no script-src directive");
  process.exit(1);
}

if (!scriptSrc.includes("'unsafe-inline'")) {
  console.error(
    "check-csp: FAIL — script-src dropped 'unsafe-inline'.\n" +
      "TanStack Start inline hydration scripts will be blocked and the landing page will go blank.\n" +
      "Restore 'unsafe-inline' or switch to per-request nonce CSP (not a static Vercel header).",
  );
  process.exit(1);
}

if (!scriptSrc.includes("https://challenges.cloudflare.com")) {
  console.error("check-csp: FAIL — script-src must allow Cloudflare Turnstile");
  process.exit(1);
}

console.log("check-csp: OK — script-src allows framework inline hydration + Turnstile");
