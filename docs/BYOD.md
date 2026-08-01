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

Example wiring: project purge candidates/deletes.

Browser queries still use the shared publishable client today for most screens. Expand `resolveOrgDataClient` usage (or a future data proxy) as customer DBs are provisioned with the iProjectX schema.

## Customer project prep

1. Receive the **BYOD schema pack** from the platform admin (**Download schema** on the BYOD panel), or regenerate it from the same migration set in-repo.
2. Apply the SQL file to the customer Postgres database (`psql -f iprojectx-byod-schema-….sql` or your migration runner).
3. Expose a PostgREST-compatible HTTPS API with a service-role / admin secret.
4. Hand the URL + secret back to the platform admin for Save → Test → Activate.

The pack concatenates tenant-relevant migrations from `supabase/migrations/` and **excludes** control-plane-only files (billing, landing, EOI/legal, support tickets, BYOD secrets table, SSO/IP/AI org flags, org integrations). Auth, billing, white-label, and BYOD connection secrets always stay on the iProjectX plane.

Connection test only verifies URL + service-role authentication — portfolio features need the schema applied first.
