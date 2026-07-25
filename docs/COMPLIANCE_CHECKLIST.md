# iProjectX — Your compliance checklist

Use this after the latest security deploy. Technical controls are largely in place; the items below are what **you** (or your ops) must complete for enterprise / SOC 2 readiness.

**Ops validated (2026-07-25):** Supabase TOTP MFA On · hardening + `security_events` + audit admin-read SQL applied · latest `main` deployed · MFA / logging / audit-access smoke tests passed.

---

## A. Do this week (required)

| # | Task | How | Done? |
|---|------|-----|-------|
| A1 | **Enable Supabase TOTP MFA** | Supabase → Authentication → Multi-Factor → TOTP **On** | ✅ |
| A2 | **Run SQL migration** `20260725160000_security_events_and_eoi_revoke.sql` | Supabase → SQL Editor → paste & Run (file in repo under `supabase/migrations/`) | ✅ |
| A3 | **Deploy latest `main`** | Wait for Vercel production deploy after merge | ✅ |
| A4 | **Smoke-test MFA** | Sign out → sign in → enroll/challenge authenticator → land in `/app` | ✅ |
| A5 | **Smoke-test auth logging** | Failed login once → Platform → **Security events** shows `login_failed`. Successful login → `login`. Sign out → `logout`. | ✅ |
| A5b | **Audit log access** | As a non-admin user, `/app/audit-log` should be hidden/denied. As org admin, it should load. | ✅ |
| A5c | **Run audit RLS SQL** | Apply `20260725170000_audit_events_admin_read.sql` in Supabase SQL Editor | ✅ |
| A5d | **Run hardening SQL** | Apply `20260725120000_security_hardening.sql` if not already | ✅ |
| A6 | **Confirm sessionStorage** | DevTools → Application → Session Storage has `sb-*-auth-token`. Local Storage should **not** hold that token. | ✅ (covered in smoke) |
| A7 | **Confirm CSP** | Production response headers include `Content-Security-Policy` with Turnstile + fonts + Supabase. Landing fonts still load. | ✅ (covered in deploy) |
| A8 | **Manual invoicing only** | No cron needed. Use Platform → Invoices → Email → Mark paid. Optionally set `BILLING_CRON_SECRET` anyway so the unused endpoint stays locked. | ☐ (process choice) |
| A9 | **Email provider for invoices** | Set `RESEND_API_KEY` or `SENDGRID_API_KEY` + `INVOICE_FROM_EMAIL` in Vercel if you email invoices | ☐ (only if emailing invoices) |

---

## B. Monthly / quarterly (SOC 2 evidence)

| # | Task | Cadence |
|---|------|---------|
| B1 | Review `security_events` for failed-login spikes | Weekly |
| B2 | Review org user lists / deactivate leavers | Monthly |
| B3 | Access review of `platform_admin` and `org_admin` roles | Quarterly |
| B4 | Confirm vendor DPAs (Supabase, Vercel, Cloudflare, Resend/SendGrid) | Annually |
| B5 | Re-read / update `docs/isms/*` if process changes | Annually |
| B6 | **Export auditor evidence packs** (one click) | Before audits / on request |

### One-click evidence export (in product)

| Pack | Where | Who |
|------|-------|-----|
| Org audit trail (`audit_events`) | App → **Audit Log** → **Export for auditors** | Org admin / admin |
| Platform security stream (`security_events`) | Platform → **Security events** → **Export for auditors** | Platform admin |

Excel files include an `Export_Metadata` sheet (period, row count, export time) plus the event rows (cap **10,000** — narrow dates if you hit the cap). The export itself is logged as `admin_action`.

**Still outside the product for Type II:** signed access-review minutes, incident tickets, vendor DPAs, change-approval records, and months of continuous operating evidence for the auditor period.

---

## C. Certification path (later — not blocking product)

| Goal | What’s left |
|------|-------------|
| **SOC 2 Type II** | Hire auditor; run controls 3–12 months; collect evidence (access reviews, incidents, change logs) |
| **ISO 27001** | Formal ISMS project + certification body |
| **GDPR / APP** | DPIA, retention schedule, privacy notices (legal), breach notification process already sketched in ISMS |

---

## D. What “Excel CVE” means (plain English)

Old library **`xlsx`** had known security bugs (attackers could craft a malicious spreadsheet to crash or compromise the browser when imported).

**Status: fixed.** We removed `xlsx` and use `read-excel-file` / `write-excel-file` instead. Normal Excel import/export still works; the vulnerable package is gone.

---

## E. Validation snapshot (engineering + ops)

| Control | Status |
|---------|--------|
| Critical authz (provision, org lock, EOI, forced password) | **Pass** |
| MFA for all users | **Pass** (Supabase TOTP On + smoke-tested) |
| Safer sessions (sessionStorage + PKCE) | **Pass** |
| Excel CVE | **Pass** (package removed) |
| Login / logout / failed-login logging | **Pass** (`security_events` SQL + smoke-tested) |
| Audit log admin-only read | **Pass** (SQL + smoke-tested) |
| One-click auditor Excel export | **Pass** (Audit Log + Platform Security) |
| Security headers + CSP | **Pass** |
| ISMS docs | **Pass** (`docs/isms/`) |
| Security audit report | **Pass** (`docs/SECURITY_AUDIT.md`) |
| Production deploy | **Pass** (latest `main`) |
| Billing cron | Not used (manual invoicing) — endpoint fail-closed if secret unset |

**Go-live security gate: CLOSED.** Remaining work is operational evidence for certification (section B/C), not product blockers.
