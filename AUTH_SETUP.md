# Auth setup — GitHub + Vercel + Supabase + Cloudflare Turnstile

This app uses Supabase for auth (email + password, extendable to OAuth) and
Cloudflare Turnstile as a bot-check on the sign-in / sign-up form. Below is
the exact wiring for a Git → Vercel → Supabase deployment.

---

## 1. Supabase (auth backend)

1. In your Supabase project → **Authentication → Providers**, enable
   **Email**. Turn off "Confirm email" only if you want instant login
   without confirmation (dev only).
2. **Authentication → URL configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: add both `https://<your-vercel-domain>/**` and
     `http://localhost:5173/**` (for local dev).
3. Copy from **Project Settings → API**:
   - Project URL
   - `anon` / publishable key
   - `service_role` (secret) key — server-only
4. Optional: add Google/Apple/etc. providers here — the app already listens
   for their sessions via `onAuthStateChange`.

## 2. Cloudflare Turnstile (bot check)

1. Go to [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Add a site. For domain, list both your production Vercel domain and
   `localhost` (Turnstile supports it for dev).
3. Widget mode: **Managed** (recommended).
4. Copy the **Site Key** and **Secret Key**.

## 3. Vercel environment variables

Add these under **Project → Settings → Environment Variables** (matching
the names already in your Vercel screenshot):

| Name                              | Scope             | Value                                    |
| --------------------------------- | ----------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Preview + Prod    | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Preview + Prod    | Supabase publishable / anon key          |
| `SUPABASE_SECRET_KEY`             | Preview + Prod    | Supabase service-role key                |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`  | Preview + Prod    | Cloudflare Turnstile site key            |
| `TURNSTILE_SECRET_KEY`            | Preview + Prod    | Cloudflare Turnstile secret key          |
| `STRIPE_WEBHOOK_SECRET`           | Prod (optional)   | If you wire Stripe billing later         |

Vercel Framework Preset: **Vite**.
Build command: `npm run vercel-build` (this runs `scripts/env-bridge.mjs`
which aliases the `NEXT_PUBLIC_*` names to the `VITE_*` names Vite reads
at build time, then runs `vite build`).
Output directory: leave default (framework-detected).

## 4. Local dev (`.env`)

Create `.env.local` in the repo root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAA...
```

Run `npm run dev`. The bridge script isn't needed locally because
`import.meta.env` also reads the `NEXT_PUBLIC_*` values via the fallback
in `src/components/turnstile.tsx`, and Supabase is bootstrapped via
`VITE_SUPABASE_URL` (you can either add `VITE_*` variants or use the
bridge script locally: `node scripts/env-bridge.mjs`).

## 5. What the app does at runtime

- **Sign-in / sign-up page** (`/auth`): renders the Turnstile widget
  under the form. Submit is disabled until the widget returns a token.
- **Server verify**: the token is sent to `verifyTurnstile`
  (`src/lib/turnstile.functions.ts`) which calls Cloudflare's
  `siteverify` endpoint using `TURNSTILE_SECRET_KEY` before the app
  calls `supabase.auth.signInWithPassword` / `signUp`.
- **Graceful fallback**: if `TURNSTILE_SECRET_KEY` is missing on the
  server (or the site key is missing on the client), the widget is
  hidden and verification is skipped — useful for local dev without a
  Turnstile account.

## 6. Rotating keys

- Supabase: **Settings → API → Reset** the anon/service-role keys, then
  update Vercel env vars and redeploy.
- Turnstile: rotate from the Turnstile dashboard, update the two Vercel
  env vars, redeploy.
