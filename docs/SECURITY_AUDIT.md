# iProjectX Security Audit & Hardening Review

**Date:** 2026-07-25  
**Scope:** Full repository `/workspace` (application + Supabase migrations + Vercel config)  
**Auditor role:** Principal Security Engineer / SOC 2 / OWASP ASVS L2 / SaaS multi-tenant  

---

## 0. Architecture correction (important)

The request assumed **Next.js API routes/server actions**. The **actual stack** is:

| Layer | Reality |
|--------|---------|
| Frontend / SSR | **TanStack Start + TanStack Router + React 19 + Vite** |
| Hosting | **Vercel** (`vercel.json` → `"framework": "vite"`) |
| Backend | **TanStack `createServerFn`** + one Nitro API route |
| Database / Auth | **Supabase (PostgreSQL + Auth + RLS)** |
| Edge functions | **None** under `supabase/functions` |

Legacy `NEXT_PUBLIC_*` env names are bridged to `VITE_*` via `scripts/env-bridge.mjs`. Treat “API routes / server actions” as **server functions + `/api/public/hooks/*`**.

---

## Phase 1 – Security Assessment

### 1.1 Authentication

| Risk | Status | Evidence |
|------|--------|----------|
| Session in `localStorage` (XSS → account takeover) | **High** (inherent to Supabase JS default) | `src/integrations/supabase/client.ts` |
| MFA | **Missing** | No TOTP/enroll/challenge in app |
| Password reset | **Partial** | `auth.tsx` + `reset-password.tsx`; min length raised to **8** in this PR |
| Email verification | **Config-dependent** | Dashboard + `AUTH_SETUP.md`; admin provision uses `email_confirm: true` |
| Forced password change bypass | **Fixed this PR** | Was `clearMustChangePassword` without password proof; now `completeForcedPasswordChange` |
| Session fixation | **Low** | Supabase issues new session on auth |
| JWT validation on server fns | **Present** | `auth-middleware.ts` (`getClaims`) |
| Device/session management UI | **Missing** | No list/revoke sessions in-app |

### 1.2 Authorization / tenancy

| Risk | Status | Evidence |
|------|--------|----------|
| RBAC roles | **Present** | `app_role` + `user_roles` + helpers |
| RLS as primary data control | **Present** | Migrations enable RLS on created tables |
| UI page permissions | **Partial** | `role_table_permissions` UI-only; default-allow when empty (`permissions.ts`) |
| Platform routes client-only gate | **Medium** | `platform.tsx` `beforeLoad`; real protection = server asserts + RLS |
| Account takeover via user provision | **Critical → Fixed** | `provisionUser` reset password on existing email |
| Profile `org_id` self-reassign | **High → Fixed (migration)** | Trigger `tg_profiles_lock_org_id` |
| `create_org_and_join` org hop | **High → Fixed (migration)** | Refuses if already in an org |
| Open `organizations` INSERT | **High → Fixed (migration)** | Platform admin only |
| `project_streams` visibility bypass | **Medium → Fixed (migration)** | Now `user_can_view_project` |
| Any-member writes (`documents`, `lessons_learned`, `demand_pipeline`, `governance_channels`) | **Medium (open)** | Original migrations |

### 1.3 Supabase RLS table

| Table | RLS | Risk | Remediation |
|-------|-----|------|-------------|
| `organizations` | Yes | Was **High** (any auth INSERT) | Platform-only INSERT + guarded RPC (**migration**) |
| `profiles` | Yes | Was **High** (org_id escape) | Lock trigger (**migration**) |
| `user_roles` | Yes | Medium | Keep admin-only writes; audit role changes (**done in app**) |
| `projects` + most children | Yes | Low–Medium | Visibility via `user_can_view_project` |
| `project_streams` | Yes | Was Medium (org-wide SELECT) | Visibility aligned (**migration**) |
| `resources`, `demand_pipeline`, `portfolio_scenarios`, `governance_channels` | Yes | Medium | Org-wide; tighten if project-scoped secrecy required |
| `documents`, `lessons_learned` | Yes | Medium | Any org member can write — restrict to editors |
| `audit_log` / `audit_events` | Yes | Medium (forgeable inserts) | `audit_events` insert now admin-only (**migration**); prefer service-role writes |
| `eoi_requests` | Yes | Was **High** (anon INSERT open) | Public INSERT removed; server fn + service role (**this PR**) |
| `billing_plans`, `landing_config`, `legal_policies` | Yes | Low | Public read by design |
| `subscriptions`, `invoices`, `invoice_payments` | Yes | Low | Org/platform scoped |
| `platform_expenses` | Yes | Low | Platform only |
| `notifications` | Yes | Low | Own-row |
| `support_tickets` (+ comments/settings) | Yes | Low | Platform + org support gate |
| `role_table_permissions` | **Yes (ensured)** | Was **unknown in migrations** | CREATE IF NOT EXISTS + RLS (**migration**) |
| `work_items`, `stage_gates`, `milestones`, etc. | Yes | Low | Project visibility rewrites applied historically |

**Service role:** used only in `client.server.ts` and server paths — **not** mapped to `VITE_*`. Good.

### 1.4 API / server function security

| Surface | AuthN | AuthZ | Gaps addressed |
|---------|-------|-------|----------------|
| `/api/public/hooks/billing-run` | Cron secret | N/A | **Fail closed** if `BILLING_CRON_SECRET` unset |
| `user-admin.*` / `platform-admin.*` / purge / invoices | JWT | Role asserts | Audit events added |
| `verifyTurnstile` | None | N/A | Rate limit + fail-closed secret |
| `getOrgBranding` | None | Public by design | Enumeration risk accepted |
| `submitEoiRequest` | None | Rate limit + zod | Replaces open anon INSERT |
| Most app data | User JWT → PostgREST | RLS | UI zod incomplete on Excel import |

**CSRF:** Low — Bearer token from `localStorage`, not cookie session.  
**SSRF:** Low — server `fetch` only to Turnstile / email providers.

### 1.5 Frontend

| Item | Finding |
|------|---------|
| XSS | Legal page `dangerouslySetInnerHTML` with custom escape — residual risk; no DOMPurify |
| CSP | **Added** in `vercel.json` |
| Other headers | HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy already present |
| localStorage | Supabase session + auth chrome cache — XSS is critical path |

### 1.6 Secrets

| Item | Status |
|------|--------|
| Hardcoded live secrets in `src/` | Not found |
| `.env` gitignore | **Fixed** (was missing) |
| `.env.example` | **Added** |
| Service role client exposure | Dynamic import pattern — OK if never statically imported into client chunks |

### 1.7 File uploads

| Flow | Finding |
|------|---------|
| Logo data URLs | Size caps; weak MIME; SVG risk |
| Excel (`xlsx@0.18.5`) | **High CVE**, no fix in lineage — replace library |
| Documents | URL metadata only — no Storage bucket policies in repo |
| Malware scanning | **Not present** |

### 1.8 Dependency risk (`npm audit`)

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0 | |
| High | 6 | **`xlsx` prototype pollution / ReDoS (no fix)**; eslint/minimatch chain (dev) |
| Moderate/Low | 0 | |

**Action:** Replace `xlsx` with a maintained parser (e.g. ExcelJS / SheetJS Pro) before enterprise procurement.

---

## Phase 2 – Hardening implemented in this change set

| Control | Change |
|---------|--------|
| Billing cron auth | Fail closed without `BILLING_CRON_SECRET` |
| User provision | No password reset / cross-tenant re-home on existing emails |
| Forced password change | Server sets password + clears flag atomically |
| Tenant escape | Profile `org_id` trigger + `create_org_and_join` guard + org INSERT lockdown |
| Project streams | SELECT uses `user_can_view_project` |
| EOI spam surface | Close anon INSERT; zod + rate-limited server fn |
| CSP | Vercel `Content-Security-Policy` |
| Secrets hygiene | `.gitignore` `.env*`, `.env.example` |
| Audit events | Admin user/role/org/invoice/password/billing/EOI logging helper |
| Password policy | Reset min length aligned to 8 |
| Invoice email | Zod UUID validation |
| Turnstile | Rate limit |
| `role_table_permissions` | Migration ensures table + RLS |

### Still required (not fully implemented)

1. **MFA** (Supabase MFA enroll/challenge UX + policy for admins)  
2. **HttpOnly cookie session** (or hardened XSS program + CSP nonce tightening)  
3. **Edge/WAF rate limits** (Vercel Firewall / Cloudflare) — in-process limiter is best-effort  
4. **Login/logout immutable audit** with IP/UA from edge  
5. **Replace `xlsx`**  
6. **Tighten any-member write tables**  
7. **Malware scanning** for uploads / ban SVG logos or sanitize  
8. **Session device management**  
9. **Apply migration** `20260725120000_security_hardening.sql` to production Supabase  
10. **Set `BILLING_CRON_SECRET`** in Vercel and cron caller  

---

## Phase 3 – Compliance readiness

### SOC 2 Type II (gap summary)

| Area | Implemented | Missing / evidence needed |
|------|-------------|---------------------------|
| CC6 Logical access | RLS, RBAC, admin server asserts | MFA, joiner/mover/leaver SOPs, access reviews |
| CC7 Monitoring | Partial `audit_events` | Central SIEM, failed-login alerts, on-call runbooks |
| CC8 Change mgmt | GitHub PRs | Formal CAB, prod change tickets |
| A1 Availability | Vercel/Supabase | DR/BCP tests, RTO/RPO docs |
| C1 Confidentiality | TLS, RLS | DLP, encryption-at-rest attestations from vendors |
| PII / privacy | Partial | DPIA, retention, subprocessors list |

**SOC 2 readiness (control design): ~45%** — rising to ~60% after this PR + migration apply + MFA + monitoring.

### ISO 27001

| Theme | Status |
|-------|--------|
| ISMS docs (SoA, risk register, policies) | **Missing in repo** |
| Access control (A.5/A.8) | Partial technical controls |
| Cryptography | TLS via platform; app-level secrets mgmt partial |
| Logging (A.8.15) | Partial |
| Supplier security | Need Supabase/Vercel/Resend DPAs |

**ISO readiness: ~35%** (documentation-heavy gap).

### OWASP ASVS Level 2 (by section)

| ASVS section | Result | Notes |
|--------------|--------|-------|
| V1 Architecture | **Partial** | Multi-tenant model exists; threat model doc missing |
| V2 Authentication | **Partial** | Reset/force-change OK; **MFA Fail**; session storage Fail vs ideal |
| V3 Session | **Partial** | Supabase refresh; no app session inventory |
| V4 Access control | **Partial** | RLS strong; remaining write-broad tables / UI default-allow |
| V5 Validation | **Partial** | Zod on server fns; bulk Excel/import weak |
| V6 Cryptography | **Partial** | Platform-managed |
| V7 Error handling | **Partial** | Some raw errors to client |
| V8 Data protection | **Partial** | PII in localStorage chrome cache |
| V9 Communication | **Pass** | HTTPS/HSTS |
| V10 Malicious code | **Fail** | No upload malware controls; vulnerable `xlsx` |
| V11 Business logic | **Partial** | Provision/billing fixed; visibility gaps remain |
| V12 Files | **Fail/Partial** | Weak upload validation |
| V13 API | **Partial** | Cron fixed; rate limit incomplete |
| V14 Config | **Partial** | CSP added; secrets example added |

---

## Phase 4 – Penetration test simulation (code-backed)

| Attack | Severity | Impact | Path | Fix |
|--------|----------|--------|------|-----|
| Unauth billing run | **Critical** | Invoice gen + email via service role | `POST /api/public/hooks/billing-run` without secret | **Fixed** — fail closed |
| Provision existing email | **Critical** | Password reset + org move | `provisionUser` | **Fixed** — refuse / attach without password reset |
| Profile org_id UPDATE | **High** | Tenant breakout | Direct PostgREST update | **Fixed** — trigger |
| `create_org_and_join` while in org | **High** | Org reassignment | RPC | **Fixed** |
| Clear must_change_password | **High** | Skip forced password change | Old server fn | **Fixed** |
| EOI flood | **High** | Spam/DoS | Anon INSERT | **Fixed** — policy + server fn |
| XSS → steal localStorage JWT | **High** | Full account | Any stored XSS | CSP + sanitize legal HTML + ban SVG |
| IDOR invoice email | **Medium** | Wrong-org email if authz bug | Mitigated by org check + zod UUID | Keep tests |
| SQLi | **Low** | — | Supabase client parameterized | Continue avoiding raw SQL in app |
| CSRF | **Low** | — | Bearer not cookie | Maintain |
| Mass assignment | **Medium** | Broad client updates | RLS + column grants | Prefer server fns for sensitive fields |
| `xlsx` exploit | **High** | Client RCE/DoS class bugs | Excel import | Replace dependency |
| Rate-limit bypass | **Medium** | Multi-instance serverless | In-memory limiter | Edge WAF |
| Tenant breakout via streams | **Medium** | See hidden project streams | SELECT policy | **Fixed** |

---

## Phase 5 – Scorecard & readiness

### Security scorecard (0–10)

| Domain | Before | After this PR* |
|--------|--------|----------------|
| Authentication | 4 | 5 |
| Authorization | 5 | 7 |
| API Security | 3 | 6 |
| Database Security | 6 | 8 |
| Infrastructure Security | 5 | 6 |
| Monitoring | 2 | 4 |
| Compliance | 3 | 4 |

\*After migration applied + `BILLING_CRON_SECRET` set in prod.

### Critical / High findings (remaining after PR)

1. **High** — Session tokens in `localStorage` (XSS impact)  
2. **High** — No MFA  
3. **High** — `xlsx@0.18.5` known vulnerabilities  
4. **High** — Incomplete login/logout/security monitoring  
5. **Medium** — Broad org-member write policies on several tables  
6. **Medium** — No malware scanning / weak upload MIME checks  
7. **Medium** — UI permissions default-allow  

### Remediation plan

**Critical (done in PR — apply ops):**
1. Deploy app + run migration `20260725120000_security_hardening.sql`  
2. Set strong `BILLING_CRON_SECRET` on Vercel + cron  

**High (next):**
3. Supabase MFA for `org_admin` / `platform_admin`  
4. Replace `xlsx`  
5. DOMPurify (or equivalent) on any HTML render path  
6. Centralize auth event logging (login success/failure) via Supabase Auth hooks  

**Medium:**
7. Tighten write policies on `documents` / `lessons_learned` / `demand_pipeline` / `governance_channels`  
8. Vercel Firewall rate limits on `/api/*` and auth  
9. Ban SVG logo uploads or sanitize  
10. Formal security.txt / vulnerability disclosure  

**Low:**
11. Session/device management UI  
12. Dependency renovate + CI `npm audit` gate  

### Enterprise readiness

| Metric | Score |
|--------|-------|
| **Current overall** | **58 / 100** (was ~42) |
| **SOC 2 readiness** | **~50%** design / **~20%** Type II evidence |
| **ISO 27001 readiness** | **~35%** |
| **Enterprise procurement readiness** | **~45%** (blocks: MFA, vuln `xlsx`, audit completeness, formal policies) |

---

## Ops checklist (must do after merge)

1. `supabase db push` / apply `supabase/migrations/20260725120000_security_hardening.sql`  
2. Vercel env: `BILLING_CRON_SECRET=<long random>`  
3. Update cron job to send header `x-cron-secret: …`  
4. Confirm EOI form still submits on production landing  
5. Smoke-test: create user with existing email → expect safe error (no password reset)  
6. Smoke-test: forced password change still works  

---

## Appendix – Key files touched

- `supabase/migrations/20260725120000_security_hardening.sql`  
- `src/routes/api/public/hooks/billing-run.ts`  
- `src/lib/user-admin.functions.ts`  
- `src/lib/platform-admin.functions.ts`  
- `src/lib/eoi.functions.ts` / `src/components/eoi-form.tsx`  
- `src/lib/security-audit.ts` / `src/lib/rate-limit.ts`  
- `src/lib/invoices.functions.ts` / `src/lib/turnstile.functions.ts`  
- `src/routes/force-password-change.tsx` / `src/routes/reset-password.tsx`  
- `vercel.json` / `.gitignore` / `.env.example`  
