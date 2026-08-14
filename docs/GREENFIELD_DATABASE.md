# Greenfield database (new Supabase project)

Use this when you need a **brand-new** empty database that matches the app — without chasing individual migrations.

## One-shot (recommended)

1. Create a new Supabase project.
2. Open **SQL Editor** (postgres / service role).
3. Run the complete pack (schema + functions/triggers/RLS + baseline seed + platform admin + sample portfolio):

```bash
# From the repo (regenerate after pulling latest migrations):
npm run build:full-schema
npm run build:replication
```

Then apply:

```text
supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql
```

Or via CLI:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql
```

4. Set app env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*`, Turnstile, email, `BILLING_CRON_SECRET`, etc.) and deploy.

Default platform admin from the pack: see `fresh_seed_platform_admin.sql` (typically `admin@iprojectx.com` — change password immediately).

## What each generated file is for

| File | When to use |
|---|---|
| `COMPLETE_SUPABASE_REPLICATION.sql` | **New empty project** — everything in one paste |
| `iprojectx_full_platform_schema.sql` | Schema/functions/triggers only (no row data) |
| `repair_platform_functions_triggers_policies.sql` | Existing DB missing functions/policies after a partial apply |
| `seed_platform_baseline.sql` | Plans, landing, legal, invoice template |
| `public/byod/iprojectx-byod-schema.sql` | Customer BYOD tenant DB only (excludes control-plane) |

Regenerate all:

```bash
npm run build:full-schema   # schema + repair
npm run build:replication   # complete one-shot pack
npm run build:byod-schema   # customer BYOD download pack
```

## Existing database (not empty)

Do **not** re-run `COMPLETE_SUPABASE_REPLICATION.sql` on a live DB (it assumes empty). Instead:

1. Apply any missing files under `supabase/migrations/` in timestamp order, **or**
2. Run `repair_platform_functions_triggers_policies.sql` after `check_platform_ddl.sql` if tables exist but functions/policies are stale.

Latest security / alerts migrations to confirm present:

- `20260814170000_raid_escalation_and_alert_digests.sql`
- `20260814180000_security_hardening_rls_rate_acl.sql`

## Ops tips

- Prefer `ON_ERROR_STOP=1` so a failed statement aborts the batch.
- After apply, smoke-test: sign in → MFA → open Risks / Decisions / Platform settings.
- BYOD customers get the **BYOD schema pack** from Platform → Branding → BYOD → Download schema (not the complete platform pack).
