# Auth setup — GitHub + Vercel + Supabase + Cloudflare Turnstile

This app uses Supabase for auth (email + password, extendable to OAuth) and
Cloudflare Turnstile as a bot-check on the sign-in / sign-up form. Below is
the exact wiring for a Git → Vercel → Supabase deployment.

---

## 1. Supabase (auth backend)

1. In your Supabase project → **Authentication → Providers**, enable
   **Email**. Turn off "Confirm email" only if you want instant login
   without confirmation (dev only).
2. **Authentication → Multi-factor authentication**: enable **TOTP**.
   Required — the app forces **every user** to enroll an authenticator app.
3. **Authentication → URL configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: add both `https://<your-vercel-domain>/**` and
     `http://localhost:5173/**` (for local dev).
4. Copy from **Project Settings → API**:
   - Project URL
   - `anon` / publishable key
   - `service_role` (secret) key — server-only
5. Optional: add Google/Apple/etc. providers here — the app already listens
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
Install command: `npm install` (not `npn` — that typo causes exit 127).
Build command: `npm run vercel-build` (this runs `scripts/env-bridge.mjs`
which aliases the `NEXT_PUBLIC_*` names to the `VITE_*` names Vite reads
at build time, then runs `vite build`).
Output directory: leave default (framework-detected).

These are also set in `vercel.json`. If a dashboard **Override** still has
`npn install`, clear or fix it under **Project → Settings → Build &
Development Settings**, then redeploy.

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
- **Graceful fallback (local/dev only)**: if `TURNSTILE_SECRET_KEY` is
  missing **and** `NODE_ENV` is not production/preview, the widget may be
  skipped for local development.
- **Fail-closed in production**: when the site is production/preview and
  `TURNSTILE_SECRET_KEY` is missing (or verification fails), sign-in /
  sign-up is **rejected**. Do not omit the secret on Vercel production.

## 6. Rotating keys

- Supabase: **Settings → API → Reset** the anon/service-role keys, then
  update Vercel env vars and redeploy.
- Turnstile: rotate from the Turnstile dashboard, update the two Vercel
  env vars, redeploy.

## 7. Optional — Approved Open AI model (per organisation)

**In-house AI** (local portfolio engine) is the default. Customer portfolio
context stays in-session; no model egress.

To offer an **Approved Open AI model** (OpenAI-compatible endpoint: Azure
OpenAI, private Ollama/vLLM, or your gateway) **only for orgs that request it**:

1. Set server env (Vercel — never `VITE_*`):

| Name | Scope | Notes |
|------|-------|-------|
| `INHOUSE_AI_ENABLED` | Server | `true` to force on (optional if base+model set) |
| `INHOUSE_AI_BASE_URL` | Server | Chat completions base (deployment URL or `…/v1`) |
| `INHOUSE_AI_API_VERSION` | Server | Azure: e.g. `2024-06-01` |
| `INHOUSE_AI_MODEL` | Server | Deployment / model name |
| `INHOUSE_AI_API_KEY` | Server | Bearer / Azure `api-key` (omit for open local Ollama) |
| `INHOUSE_AI_LABEL` | Server | UI label, default `Approved Open AI model` |

2. Apply SQL migration `20260725190000_org_inhouse_ai_model_enabled.sql`
   (adds `organizations.inhouse_ai_model_enabled`, default **false**).

3. In the app: **Platform → In-house AI** — toggle per organisation.
   Off = **In-house AI**; On = **Approved Open AI model**.
   Only `platform_admin` can change the flag (DB trigger + server fn).

Model calls run only when **both** the platform endpoint is configured **and**
that org’s toggle is on. Otherwise In-house AI answers and no context is sent out.

## 8. Optional — Enterprise SSO per organisation (SAML)

SSO is configured **per organisation** from **Platform → White Label & Branding**.
The IdP itself is registered in Supabase; the app stores the org ↔ provider
mapping and shows the SSO button on white-label login (`/auth?org=<slug>` or
`/o/<slug>/login`).

1. Apply SQL migration `20260725193000_org_sso_config.sql`
   (`sso_enabled`, `sso_provider_id`, `sso_domains`, `sso_button_label`;
   only `platform_admin` can change these fields).

2. In Supabase, register the customer IdP (Team/Enterprise plan required for
   SAML SSO):
   - Dashboard → **Authentication → SSO**, or CLI:
     `supabase sso add --type saml --metadata-url <idp-metadata-url> …`
   - Copy the resulting **provider UUID**.

3. Ensure **Redirect URLs** include your app origin (same as §1).

4. In the app: **Platform → White Label & Branding** → select the org →
   enable **Enterprise SSO**, paste provider ID and/or email domains, set
   button label, **Save branding**.

5. Share the org white-label login link. Members see **Sign in with SSO**
   (plus email/password). After IdP redirect, the org-membership gate still
   applies: non-members and unprovisioned SSO users are signed out, and
   white-label entry cannot create a new organisation via onboarding.
