# supabase/manual — runnable SQL packs

| File | Purpose |
|---|---|
| **COMPLETE_SUPABASE_REPLICATION.sql** | **One-shot new project:** schema + functions/triggers/RLS + platform baseline + admin user + sample 4-project portfolio |
| `iprojectx_full_platform_schema.sql` | Schema/functions/triggers only (no row data) |
| `repair_platform_functions_triggers_policies.sql` | Repair functions/triggers/policies on an existing DB |
| `check_platform_ddl.sql` | Inventory helpers before/after repair |
| `seed_platform_baseline.sql` | Plans, landing, invoice template, legal policies, expenses |
| `fresh_seed_platform_admin.sql` | `admin@iprojectx.com` + iProjectX org |
| `wipe_seed_iprojectx_4_projects_e2e.sql` | Rich sample projects for iProjectX only (method-specific gates; Agile uses Agile template when gates enabled) |
| `delivery_methods_stage_gates.sql` | Delivery methods + per-method gate templates |
| `fix_text_app_role_ops.sql` | Fixes `text = app_role` helper functions |
| `20260814180000_security_hardening_rls_rate_acl.sql` | Pasteable copy of the security hardening migration (RLS + durable rate limits + page ACL seed). Use if the migration failed to load — then re-run via CLI or paste in SQL Editor |
| `governance_scoped_forums.sql` | Scoped governance forums (project / program / Strategic Alignment), templates, members, auto-create on new projects. Paste if the migration is not applied yet |
| `raid_codes_seed_4_projects.sql` | RAID `raid_code` schema + replacement RAID (with uuid + RSK/ISS/ACT/DEC IDs) for PRJ-001…PRJ-004 |
| `repair_landing_oversized_logos.sql` | Clears multi-MB data-URL brand logos from `landing_config` (fixes white landing after hydrate). Re-upload logos under ~400KB via Platform → Landing |

## New empty database (do this)

See **`/docs/GREENFIELD_DATABASE.md`** for the full walkthrough.

Short version:

```bash
npm run build:full-schema
npm run build:replication
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql
```

## Regenerate after new migrations

```bash
npm run build:full-schema    # iprojectx_full_platform_schema.sql + repair pack
npm run build:replication    # COMPLETE_SUPABASE_REPLICATION.sql
npm run build:byod-schema    # public/byod customer pack
```

Support options for operating the product without an in-house developer:
see `/docs/SUPPORT_AND_OPERATIONS.md`.

**New empty database?** Start with `/docs/GREENFIELD_DATABASE.md`.
