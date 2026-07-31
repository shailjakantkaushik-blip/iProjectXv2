# External integrations (Jira and more)

Per-organisation connectors so portfolio demand can flow into iProjectX from tools like **Jira**. The architecture is provider-agnostic (`org_integrations` + `integration_external_links`).

## Model

| Concern | Behaviour |
|---------|-----------|
| Who configures | Organisation admin (or platform admin) |
| UI | **Configuration → Integrations** (`/app/integrations`) |
| Secrets | AES-256-GCM ciphertext in `org_integrations` — never returned to the browser |
| Encryption key | `INTEGRATIONS_SECRETS_KEK` or reuse `BYOD_SECRETS_KEK` (≥32 chars, never `VITE_`) |
| Jira sync target | **Demand Pipeline** ideas (linked by Jira issue id/key) |
| Idempotency | `integration_external_links` unique on `(org_id, provider, external_id)` |

## Enable Jira

1. Apply migration `supabase/migrations/20260731120000_org_integrations.sql` (or paste the same SQL in the Supabase SQL editor).
2. Set `INTEGRATIONS_SECRETS_KEK` (or ensure `BYOD_SECRETS_KEK` is already set) in the deployment environment.
3. As org admin open **Integrations**.
4. Enter Jira site URL (`https://your-domain.atlassian.net`), Atlassian account email, API token, and project keys.
5. **Save** → **Test connection** → **Sync issues → Demand**.

Imported issues appear in Demand Pipeline as `[KEY] Summary` with status `Idea` and sponsor `Jira`. Convert them to projects from Demand as usual.

## Extending to other systems

Providers already reserved in schema / UI placeholders:

- `azure_devops`
- `servicenow`
- `custom_webhook`

Add a server sync path in `src/lib/integration.functions.ts` (same encrypt / test / sync pattern as Jira) and flip `available: true` in `src/lib/integration-types.ts`.

## Security notes

- `org_integrations` has **no authenticated RLS policies** — access is only via service-role server functions.
- Link rows are readable by the org; writes require org admin.
- Sync writes a security audit event when available.
