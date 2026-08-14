# Bring Your Own Database (BYOD)

Per-organisation optional customer-hosted database. **Default orgs stay on the shared iProjectX data plane.**

The runtime uses a PostgREST-compatible HTTPS API (same shape as Supabase’s REST layer). The host does **not** need to be `*.supabase.co` — self-hosted Postgres + PostgREST, or any equivalent HTTPS endpoint, is fine.

## Model

| Plane                                                          | Location                               |
| -------------------------------------------------------------- | -------------------------------------- |
| Control plane (orgs, users, billing, white-label, BYOD config) | Always iProjectX data plane            |
| Tenant business data (projects, RAID, …) when BYOD **active**  | Customer database (server-side client) |
| Tenant business data when BYOD **off**                         | iProjectX data plane (unchanged)       |

## Secrets

- Stored in `org_byod_connections` as **AES-256-GCM ciphertext**
- Encryption key: server env `BYOD_SECRETS_KEK` (≥32 chars, never `VITE_`)
- Platform admin UI is **write-only** (paste / replace / clear — never view)
- Table has **no authenticated RLS policies**; access only via service-role server functions

## Platform admin

**Platform → White Label & Branding** → select organisation → **Customer-hosted database (BYOD)**

1. Set `BYOD_SECRETS_KEK` in the deployment environment
2. Apply migration `supabase/migrations/20260729120000_org_byod_connections.sql` (control plane)
3. Click **Download schema** and send `iprojectx-byod-schema-YYYY-MM-DD.sql` to the customer
4. Customer applies that SQL on their Postgres (see below)
5. Paste customer **database API URL** (HTTPS) + service role / admin secret → **Save**
6. **Test connection**
7. Toggle **Use customer DB** (requires successful test)

## Runtime

Server code should resolve the data client with:

```ts
const { client, mode } = await resolveOrgDataClient(orgId);
// mode: "platform" | "byod"
```

**Scale-out path for largest tenants:** activate BYOD so portfolio reads/writes for that org hit the customer database. Portfolio server APIs and RAID CRUD already do this:

| Server API | Purpose |
| --- | --- |
| `listPortfolioProjects` / `listPortfolioWorkItems` | Paginated, filtered register pages |
| `getPortfolioKpis` | `org_kpi_summaries` rollup (refresh via `refresh_org_kpi_summary`) |
| `getPortfolioStats` | Chart aggregates (`portfolio_project_stats`) |
| `enqueueOrgExportJob` / `processOrgExportJobChunk` | Chunked async exports |
| `listOrgRisks` / `upsertOrgRisk` / `deleteOrgRisk` (+ issues/actions) | RAID register CRUD when BYOD is active (`tenant-raid.functions.ts`); EditableCell also routes RAID updates through these helpers |

Apply migration `20260804120000_scale_hardening.sql` on the data plane the org uses (shared or BYOD). It adds covering indexes, index-friendly RLS (`org_id` predicate first), KPI summaries, export job table helpers, and partition-plan ops markers.

When BYOD is **active**, Risks (and EditableCell updates on risks/issues/actions) use `resolveOrgDataClient` so data stays on the customer DB. Other screens may still use the shared publishable client — prefer portfolio / tenant server functions on those hot paths as they are migrated.

## Customer project prep

1. Receive the **BYOD schema pack** from the platform admin (**Download schema** on the BYOD panel), or regenerate it from the same migration set in-repo.
2. Apply the SQL file to the customer Postgres database (`psql -f iprojectx-byod-schema-….sql` or your migration runner).
3. Expose a PostgREST-compatible HTTPS API with a service-role / admin secret.
4. Hand the URL + secret back to the platform admin for Save → Test → Activate.

The pack concatenates tenant-relevant migrations from `supabase/migrations/` and **excludes** control-plane-only files (billing, landing, EOI/legal, support tickets, BYOD secrets table, SSO/IP/AI org flags, org integrations). Auth, billing, white-label, and BYOD connection secrets always stay on the iProjectX plane.

Connection test only verifies URL + service-role authentication — portfolio features need the schema applied first.
