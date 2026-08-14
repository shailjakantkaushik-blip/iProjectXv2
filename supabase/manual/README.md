# supabase/manual — runnable SQL packs

| File | Purpose |
|---|---|
| **COMPLETE_SUPABASE_REPLICATION.sql** | **One-shot new project:** schema + functions/triggers/RLS + platform baseline + admin user + sample 4-project portfolio |
| `iprojectx_full_platform_schema.sql` | Schema/functions/triggers only (no row data) |
| `seed_platform_baseline.sql` | Plans, landing, invoice template, legal policies, expenses |
| `fresh_seed_platform_admin.sql` | `admin@iprojectx.com` + iProjectX org |
| `wipe_seed_iprojectx_4_projects_e2e.sql` | Rich sample projects for iProjectX only |
| `delivery_methods_stage_gates.sql` | Delivery methods + per-method gate templates |
| `fix_text_app_role_ops.sql` | Fixes `text = app_role` helper functions |

Regenerate the complete pack:

```bash
npm run build:replication
```

Support options for operating the product without an in-house developer:
see `/docs/SUPPORT_AND_OPERATIONS.md`.
