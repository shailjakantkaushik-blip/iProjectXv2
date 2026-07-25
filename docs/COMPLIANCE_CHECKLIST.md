# iProjectX — Your compliance checklist

Use this after the latest security deploy. Technical controls are largely in place; the items below are what **you** (or your ops) must complete for enterprise / SOC 2 readiness.

---

## A. Do this week (required)

| # | Task | How | Done? |
|---|------|-----|-------|
| A1 | **Enable Supabase TOTP MFA** | Supabase → Authentication → Multi-Factor → TOTP **On** | ☐ |
| A2 | **Run SQL migration** `20260725160000_security_events_and_eoi_revoke.sql` | Supabase → SQL Editor → paste & Run (file in repo under `supabase/migrations/`) | ☐ |
| A3 | **Deploy latest `main`** | Wait for Vercel production deploy after merge | ☐ |
| A4 | **Smoke-test MFA** | Sign out → sign in → enroll/challenge authenticator → land in `/app` | ☐ |
| A5 | **Smoke-test auth logging** | Failed login once → check `security_events` table for `login_failed`. Successful login → `login`. Sign out → `logout`. | ☐ |
| A6 | **Confirm sessionStorage** | DevTools → Application → Session Storage has `sb-*-auth-token`. Local Storage should **not** hold that token. | ☐ |
| A7 | **Confirm CSP** | Production response headers include `Content-Security-Policy` with Turnstile + fonts + Supabase. Landing fonts still load. | ☐ |
| A8 | **Manual invoicing only** | No cron needed. Use Platform → Invoices → Email → Mark paid. Optionally set `BILLING_CRON_SECRET` anyway so the unused endpoint stays locked. | ☐ |
| A9 | **Email provider for invoices** | Set `RESEND_API_KEY` or `SENDGRID_API_KEY` + `INVOICE_FROM_EMAIL` in Vercel if you email invoices | ☐ |

---

## B. Monthly / quarterly (SOC 2 evidence)

| # | Task | Cadence |
|---|------|---------|
| B1 | Review `security_events` for failed-login spikes | Weekly |
| B2 | Review org user lists / deactivate leavers | Monthly |
| B3 | Access review of `platform_admin` and `org_admin` roles | Quarterly |
| B4 | Confirm vendor DPAs (Supabase, Vercel, Cloudflare, Resend/SendGrid) | Annually |
| B5 | Re-read / update `docs/isms/*` if process changes | Annually |

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

## E. Validation snapshot (engineering)

| Control | Status |
|---------|--------|
| Critical authz (provision, org lock, EOI, forced password) | Pass |
| MFA for all users | Pass (needs Supabase TOTP on) |
| Safer sessions (sessionStorage + PKCE) | Pass |
| Excel CVE | Pass (package removed) |
| Login / logout / failed-login logging | Pass (needs `security_events` SQL) |
| Security headers + CSP | Pass (fonts + Turnstile + Supabase) |
| ISMS docs | Pass (`docs/isms/`) |
| Security audit report | Pass (`docs/SECURITY_AUDIT.md`) |
| Billing cron | Not used (manual invoicing) — endpoint fail-closed if secret unset |
