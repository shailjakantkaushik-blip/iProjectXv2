#!/usr/bin/env node
/**
 * Vercel env bridge: maps NEXT_PUBLIC_* / non-prefixed vars to the VITE_*
 * names that this app reads at build time. Run this before `vite build`.
 *
 * Vercel setup (Project Settings → Environment Variables):
 *   NEXT_PUBLIC_SUPABASE_URL         → Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    → Supabase publishable / anon key
 *   SUPABASE_SECRET_KEY              → Supabase service-role key (server only)
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY   → Cloudflare Turnstile site key
 *   TURNSTILE_SECRET_KEY             → Cloudflare Turnstile secret key
 *   STRIPE_WEBHOOK_SECRET            → (optional) Stripe webhook signing secret
 *
 * This script writes a `.env.production.local` so Vite's build picks up the
 * VITE_* aliases, and leaves server-only vars untouched.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const map = {
  VITE_SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  VITE_SUPABASE_PUBLISHABLE_KEY: [
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ],
  VITE_SUPABASE_PROJECT_ID: [
    "NEXT_PUBLIC_SUPABASE_PROJECT_ID",
    "SUPABASE_PROJECT_ID",
  ],
  VITE_TURNSTILE_SITE_KEY: [
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SITE_KEY",
  ],
};

const lines = [];
for (const [target, sources] of Object.entries(map)) {
  if (process.env[target]) continue; // already set
  for (const src of sources) {
    const val = process.env[src];
    if (val) {
      lines.push(`${target}=${val}`);
      process.env[target] = val;
      break;
    }
  }
}

// Server also expects SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  lines.push(`SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
}
if (
  !process.env.SUPABASE_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  lines.push(
    `SUPABASE_PUBLISHABLE_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  );
}
if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_SECRET_KEY
) {
  lines.push(`SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SECRET_KEY}`);
}

const outPath = resolve(process.cwd(), ".env.production.local");
if (lines.length) {
  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(
    `[env-bridge] wrote ${lines.length} VITE_* aliases → .env.production.local`,
  );
} else {
  console.log("[env-bridge] no aliases needed");
}
