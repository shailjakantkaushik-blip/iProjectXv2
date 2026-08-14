# Supporting iProjectX without an in-house developer

This guide is for owners/operators who need the application kept running and
improved, but do not currently have a developer who knows the full codebase.

## What you are operating

| Layer | Technology | Who usually owns it |
|---|---|---|
| App (UI + server) | Vercel + TanStack Start | App host / web vendor |
| Database + auth | Supabase (Postgres, Auth, RLS) | Data / platform vendor |
| Domains / email / DNS | Your registrar + email provider | IT / MSP |
| Secrets & env | Vercel + Supabase dashboards | Whoever has admin access |

A full fresh database can be rebuilt from:

`supabase/manual/COMPLETE_SUPABASE_REPLICATION.sql`

Full walkthrough for a **new empty database**: [`docs/GREENFIELD_DATABASE.md`](../docs/GREENFIELD_DATABASE.md).

(see header comments in that file for apply steps).

---

## Support options (pick one primary, optionally add a backup)

### Option A — Managed product support retainer (recommended)

Hire a small agency / freelance senior full-stack engineer on a **monthly retainer**
(e.g. 10–40 hours/month) who:

- Holds admin access to Vercel + Supabase (separate support account, not personal)
- Can apply SQL migrations, fix production incidents, and ship small features
- Documents every change in GitHub PRs (so you keep ownership)

**Best when:** you want one accountable party and predictable monthly cost.

**Ask them to prove:** experience with Supabase RLS, Vercel, React, and multi-tenant SaaS.

---

### Option B — Platform-native support + specialist on call

Split ownership:

1. **Supabase** — Pro/Team plan + their support for DB/Auth/outages  
2. **Vercel** — Pro plan + support for deploys/hosting  
3. **Named specialist** — on-call for *application* bugs (hours bank or T&M)

**Best when:** most failures are infra, and app changes are occasional.

---

### Option C — Cursor / AI-assisted maintenance with a technical owner

Keep a **technical product owner** (can be you or a PM/ops person) who:

- Uses Cursor Cloud Agents / IDE against this repo for fixes and SQL
- Merges PRs only after smoke-testing login, one project page, and billing
- Escalates hard issues to a contracted senior engineer (Option A as backup)

**Best when:** budget is tight and changes are incremental; still needs someone
who can run SQL in Supabase and verify deploys.

**Not enough alone for:** security incidents, data corruption, complex RLS bugs.

---

### Option D — Full handoff to a product studio

Outsource roadmap + support to a studio that treats iProjectX as a product:

- SLA for severity 1/2 incidents
- Quarterly hardening / dependency updates
- Feature backlog owned by them with your prioritisation

**Best when:** you want near zero involvement in engineering decisions.

---

### Option E — Hire / train an internal generalist later

Hire a mid-level full-stack engineer and give them:

1. This repo + `COMPLETE_SUPABASE_REPLICATION.sql` on a staging project  
2. `docs/` (security, BYOD, integrations, ISMS)  
3. A 30-day “break glass” checklist (below)

**Best when:** you expect continuous product development.

---

## Minimum operating checklist (any option)

1. **Staging environment** — second Supabase project + Vercel preview/staging  
2. **Admin break-glass accounts** — platform admin + org admin stored in a password manager  
3. **Backups** — Supabase PITR / daily backups enabled; test restore once  
4. **Secrets inventory** — Vercel env + Supabase keys + email/SSO/AI keys documented  
5. **Incident contacts** — who gets called for “login broken”, “data missing”, “bill spike”  
6. **Change rule** — no production SQL without a saved script in `supabase/manual/` or a migration  

---

## What to give any support partner on day 1

- GitHub repo access (this project)  
- Vercel project access  
- Supabase project access (or a staging clone built from `COMPLETE_SUPABASE_REPLICATION.sql`)  
- List of tenants / orgs in production  
- Known customisations (branding, SSO, BYOD, invoice template)  
- Preferred SLA (e.g. Sev1 &lt; 4 hours business time)

---

## Realistic cost bands (indicative only)

| Model | Typical monthly range |
|---|---|
| A Retainer | Moderate–high, predictable |
| B Platforms + T&M | Low base + spikes |
| C AI-assisted owner | Lowest cash, highest your time |
| D Studio | Highest, most coverage |
| E Internal hire | Salary + onboarding ramp |

Exact numbers depend on country and seniority — use the table for shape, not quotes.

---

## Suggested starting choice

If you have **no developer today**: start with **Option A (retainer)** for 90 days,
keep **Option C** for small content/config changes, and keep Supabase/Vercel on paid
plans with support enabled. Re-evaluate hiring (Option E) once the product roadmap
is steady.
