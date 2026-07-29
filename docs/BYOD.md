# Bring Your Own Database (BYOD)

Per-organisation optional customer-hosted Supabase. **Default orgs stay on the shared iProjectX Supabase.**

## Model

| Plane | Location |
|-------|----------|
| Control plane (orgs, users, billing, white-label, BYOD config) | Always iProjectX Supabase |
| Tenant business data (projects, RAID, …) when BYOD **active** | Customer Supabase (server-side client) |
| Tenant business data when BYOD **off** | iProjectX Supabase (unchanged) |

## Secrets

- Stored in `org_byod_connections` as **AES-256-GCM ciphertext**
- Encryption key: server env `BYOD_SECRETS_KEK` (≥32 chars, never `VITE_`)
- Platform admin UI is **write-only** (paste / replace / clear — never view)
- Table has **no authenticated RLS policies**; access only via service-role server functions

## Platform admin

**Platform → White Label & Branding** → select organisation → **Customer-hosted database (BYOD)**

1. Set `BYOD_SECRETS_KEK` in the deployment environment  
2. Apply migration `supabase/migrations/20260729120000_org_byod_connections.sql`  
3. Paste customer Supabase URL + service role secret → **Save**  
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

Apply the same `supabase/migrations` schema to the customer project before expecting portfolio features to work. Connection test only verifies URL + service-role authentication.
