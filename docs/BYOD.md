# Bring Your Own Database (BYOD)

Per-organisation optional customer-hosted database. **Default orgs stay on the shared iProjectX data plane.**

The runtime uses a PostgREST-compatible HTTPS API (same shape as Supabase’s REST layer). The host does **not** need to be `*.supabase.co` — self-hosted Postgres + PostgREST, or any equivalent HTTPS endpoint, is fine.

## Model

| Plane | Location |
|-------|----------|
| Control plane (orgs, users, billing, white-label, SSO config, BYOD secrets, support, legal, security/audit) | Always iProjectX data plane |
| Tenant business data (projects, RAID, financials, timesheets, work items, …) when BYOD **active** | Customer database via same-origin REST proxy + server `resolveOrgDataClient` |
| Tenant business data when BYOD **off** | iProjectX data plane (unchanged) |
| Auth (`/auth/v1`) | Always iProjectX (platform Supabase Auth) |

## Secrets

- Stored in `org_byod_connections` as **AES-256-GCM ciphertext**
- Encryption key: server env `BYOD_SECRETS_KEK` (≥32 chars, never `VITE_`)
- Platform admin UI is **write-only** (paste / replace / clear — never view)
- Table has **no authenticated RLS policies**; access only via service-role server functions
- Customer service-role keys are **never** sent to the browser

## Platform admin

**Platform → White Label & Branding** → select organisation → **Customer-hosted database (BYOD)**

1. Set `BYOD_SECRETS_KEK` in the deployment environment  
2. Apply migration `supabase/migrations/20260729120000_org_byod_connections.sql`  
3. Paste customer **database API URL** (HTTPS) + service role / admin secret → **Save**  
4. **Test connection**  
5. Toggle **Use customer DB** (requires successful test)

## Runtime (full app wiring)

### Browser

When `organizations.byod_active` is true for the signed-in user’s org:

1. `AuthProvider` enables client routing (`setByodClientRoutingActive`)
2. The shared `supabase` client’s `global.fetch` rewrites **tenant** `/rest/v1/{table}` calls to same-origin `/api/byod/rest/{table}`
3. Control-plane tables and `/auth/v1/*` keep using the platform Supabase URL

Table lists live in `src/lib/byod-tables.ts`.

### Proxy (`/api/byod/rest/$`)

1. Verifies the platform user JWT and requires **AAL2** (mandatory MFA)  
2. Loads `profile.org_id` and roles; resolves cached BYOD upstream credentials  
3. Applies **authorization** before forward (editor/admin gates, project visibility, timesheet owner scope)  
4. Forwards to the customer PostgREST with the **service role** key  
5. Forces `org_id=eq.{org}` on scoped tables  
6. Logs mutations to `security_events` (no request bodies)

Upstream credentials from `resolveOrgDataClient` / `resolveByodUpstream` are cached ~120s and invalidated on BYOD save / clear / test / activate.

**Why service role?** Customer PostgREST cannot validate platform Auth JWTs. Authorization is therefore enforced in the proxy (not by trusting the browser).

### Server functions

```ts
const { client, mode } = await resolveOrgDataClient(orgId);
// mode: "platform" | "byod"
```

Example: project purge candidates/deletes.

## Performance

- O(1) table allowlist check on each browser REST call (no extra RTT when BYOD is off)
- Cached decrypt + upstream client on the server (avoids per-request KEK work)
- Proxy only for tenant tables; auth and org chrome stay on platform

## Customer project prep

Apply the same schema migrations to the customer database before expecting portfolio features to work. Connection test only verifies URL + service-role authentication against a PostgREST-compatible API.
