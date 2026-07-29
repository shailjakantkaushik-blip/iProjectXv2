# Bring Your Own Database (BYOD)

Per-organisation optional customer-hosted database. **Default orgs stay on the shared iProjectX data plane.**

The runtime uses a PostgREST-compatible HTTPS API (same shape as Supabase’s REST layer). The host does **not** need to be `*.supabase.co` — self-hosted Postgres + PostgREST, or any equivalent HTTPS endpoint, is fine.

## Model

| Plane | Location |
|-------|----------|
| Control plane (orgs, users, billing, white-label, BYOD config) | Always iProjectX data plane |
| Tenant business data (projects, RAID, …) when BYOD **active** | Customer database (server-side client) |
| Tenant business data when BYOD **off** | iProjectX data plane (unchanged) |

## Secrets

- Stored in `org_byod_connections` as **AES-256-GCM ciphertext**
- Encryption key: server env `BYOD_SECRETS_KEK` (≥32 chars, never `VITE_`)
- Platform admin UI is **write-only** (paste / replace / clear — never view)
- Table has **no authenticated RLS policies**; access only via service-role server functions

## Platform admin

**Platform → White Label & Branding** → select organisation → **Customer-hosted database (BYOD)**

1. Set `BYOD_SECRETS_KEK` in the deployment environment  
2. Apply migration `supabase/migrations/20260729120000_org_byod_connections.sql`  
3. Paste customer **database API URL** (HTTPS) + service role / admin secret → **Save**  
4. **Test connection**  
5. Toggle **Use customer DB** (requires successful test)

## Runtime

Server code should resolve the data client with:

```ts
const { client, mode } = await resolveOrgDataClient(orgId);
// mode: "platform" | "byod"
```

Example wiring: project purge candidates/deletes.

Browser queries still use the shared publishable client today for most screens. Expand `resolveOrgDataClient` usage (or a future data proxy) as customer DBs are provisioned with the iProjectX schema.

## Customer project prep

Apply the same schema migrations to the customer database before expecting portfolio features to work. Connection test only verifies URL + service-role authentication against a PostgREST-compatible API.
