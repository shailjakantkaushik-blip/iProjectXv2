# iProjectX Security Audit & Hardening Review

**Date:** 2026-07-30 (BYOD proxy re-audit + certification readiness)  
**Prior:** 2026-07-26 (post-incident re-audit)  
**Scope:** Full repository `/workspace` (application + Supabase migrations + Vercel config)  
**Auditor role:** Principal Security Engineer / SOC 2 / OWASP ASVS L2 / SaaS multi-tenant  

**Operator checklist:** [`COMPLIANCE_CHECKLIST.md`](./COMPLIANCE_CHECKLIST.md)

---

## BYOD full-app proxy re-audit (2026-07-30)

### Findings (pre-fix)

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| B1 | **HIGH** | `/api/byod/rest/$` used customer **service role** with only `org_id` filter → any org member could read/mutate all tenant rows (bypassed project visibility, timesheet ownership, admin-only deletes) | **FIXED** |
| B2 | **HIGH** | Proxy validated JWT only — **no AAL2** → password session (AAL1) could call proxy before MFA | **FIXED** |

### Fixes shipped

| Control | Implementation |
|---------|----------------|
| Mandatory MFA on BYOD data path | `authenticateByodActor` requires JWT claim `aal === "aal2"` (`byod-proxy-authz.server.ts`) |
| Role gates | Non-editors blocked from mutating most tables; admin-only deletes for projects / BUs / FY / scenarios |
| Project visibility | Visible project ids resolved from customer `projects` + platform `ui_config.project_visibility` + roles; injected as `id`/`project_id=in.(…)` |
| Timesheet ownership | Non-admin non-editor forced to `user_id=eq.{caller}` on timesheets; inserts force owner |
| Mutation audit | BYOD POST/PATCH/PUT/DELETE logged to `security_events` (no bodies) |
| Rate limit | Best-effort 240 req/min/user on proxy |
| Error sanitisation | Upstream failures return generic 502 (no customer host leak) |
| Secrets | Unchanged — AES-256-GCM + `BYOD_SECRETS_KEK`; service role never to browser |

### Residual BYOD risks (accepted / documented)

1. Full bit-for-bit parity with every Postgres RLS helper (e.g. `is_timesheet_approver`) is not replicated; editors/admins get broader timesheet read than draft-only owners — matches product need for PM approval flows.
2. Customer DB must apply the same schema; encryption-at-rest / backups for BYOD tenant data are **Customer** responsibilities.
3. In-process rate limits are best-effort across Vercel isolates — pair with edge/WAF for production.

See [`BYOD.md`](./BYOD.md).

---

## BYOD secrets (2026-07-29)

- Customer DB service-role secrets encrypted with `BYOD_SECRETS_KEK` (AES-256-GCM) in `org_byod_connections`
- No authenticated RLS policies on ciphertext table — platform_admin manages via service-role server functions only
- UI is write-only (paste/replace/clear); plaintext never returned after save
- Default orgs unaffected (`organizations.byod_active = false`)
- See [`BYOD.md`](./BYOD.md)

---

## Post-incident re-audit — org white-label login (2026-07-26)


### Incident

**Symptom:** Users could authenticate via another organisation’s white-label login link (`/auth?org=` / `/o/<slug>/login`) with their own credentials and reach `/app`.

**Root cause:** In `auth.tsx`, MFA redirect (`/mfa?next=/app`) ran **before** `assertUserBelongsToOrgSlug`. Membership rejection was skipped for MFA-enrolled users.

**Cross-tenant data access?** **No evidence of foreign-org portfolio reads.** RLS binds queries to `profiles.org_id` (`get_user_org`). Victims entered **their own** home-tenant workspace after using the wrong branded link — a **trust / access-control UX breach** on the white-label gate, not an RLS tenant-escape. Still treated as **High** because the gate is a promised security control.

**Fix shipped:** Org membership check runs before MFA (`3c53291` / merge to main).

### Re-audit matrix (2026-07-26)

| Area | Status | Finding |
|------|--------|---------|
| Password + org link → MFA order | **FIXED** | Membership before `/mfa` |
| White-label home-org only | **HARDENED** | Gate requires `profiles.org_id` match (role-only allow removed) |
| MFA `next` open redirect | **FIXED** | Allowlist `/app`, `/platform`, `/onboarding` only; reject `//` |
| Authenticated shell before AAL2 | **FIXED** | Gate blocks AppShell until MFA satisfied |
| `has_any_admin` / `has_role` org scope | **FIXED (apply SQL)** | Migration `20260726093000_scope_admin_roles_to_home_org.sql` |
| `can_edit_project` bu_lead org scope | **FIXED (apply SQL)** | Same migration |
| Client roles include foreign org | **FIXED** | `auth-context` filters roles to home org + `platform_admin` |
| `adminRemoveUserRole` missing org assert | **FIXED** | Same check as assign |
| SSO soft-reject on wrong org link | **Accepted** | Existing other-org session kept; “Go to my workspace” clears org entry — no foreign data |
| Platform admin cross-org ops | **By design** | Billing, support, directory, EOI; portfolio RLS still home-scoped |
| Invoice email / In-house AI org binding | **PASS** | Caller org checks + RLS |
| Public org branding / SSO provider id | **Accepted** | Needed for SSO button; not portfolio data |

### Residual risks (accepted / ops)

1. Apply SQL migration `20260726093000_scope_admin_roles_to_home_org.sql` in Supabase before considering admin elevation closed in production.
2. In-process rate limits remain best-effort across Vercel isolates — pair with edge/WAF.
3. Page ACL default-allow when matrix unconfigured (pre-existing).
4. Platform admins intentionally see cross-org operational data (invoices, support, EOI).

### Honest assessment of prior audit coverage

Prior audits validated RLS, MFA enrollment, AI egress, and many server-fn authz paths, but **did not explicitly test the composition** “white-label org gate × MFA redirect.” That gap allowed the incident. This re-audit adds composition tests to the checklist: **any redirect/challenge that runs after password success must re-run or precede org membership checks.**

---

### Current validation status (2026-07-30)

| Control | Status | Notes |
|---------|--------|-------|
| Critical authz (provision / org lock / EOI / forced password) | **PASS** | Migrations + server fns |
| Org white-label login gate × MFA | **PASS (re-audited)** | Membership before MFA; home-org only; shell blocked until AAL2 |
| Admin role helpers scoped to home org | **PASS (apply SQL)** | `has_any_admin` / `has_role` / `can_edit_project` |
| MFA for all users | **PASS** | App + Supabase TOTP On; shell waits for MFA before data UI |
| BYOD proxy AAL2 | **PASS** | `/api/byod/rest/$` rejects non-`aal2` JWTs |
| BYOD proxy authz parity | **PASS (hardened)** | Roles + project visibility + timesheet owner scope + mutation audit |
| MFA gate vs scroll/nav perf | **PASS** | Shell stays mounted after AAL2; MFA re-checked on tab focus without tearing chrome; org gate unchanged |
| Safer sessions | **PASS** | `sessionStorage` + PKCE (not localStorage JWTs) |
| Excel CVE (`xlsx`) | **PASS** | Package removed; `read-excel-file` / `write-excel-file` |
| Login / logout / failed-login logging | **PASS** | `security_events` SQL applied; smoke-tested |
| Audit log admin-only | **PASS** | RLS SQL applied; smoke-tested |
| Security headers + CSP | **PASS** | Vercel: HSTS, CSP (Turnstile, fonts, Supabase) |
| ISMS policy pack | **PASS** | `docs/isms/` |
| Legal policies (MFA/SSO/BYOD) | **PASS (apply SQL)** | `20260730170000_legal_policies_security_byod_sso.sql` |
| Billing cron | **N/A (manual invoicing)** | Endpoint fail-closed if secret unset; no cron required |
| Production ops gate | **PASS** | Hardening SQL + deploy + MFA/logging/audit smoke tests confirmed |

**Go-live security gate: CLOSED** for shared data-plane orgs. **BYOD:** CLOSED after 2026-07-30 proxy hardening (AAL2 + authz).  

**Not “fully certified”:** SOC 2 Type II / ISO 27001 still need operating evidence + an external auditor. Technical control design is enterprise-ready; certification is an evidence-period process, not a code checkbox.


### In-house AI — permission, safety & egress validation (2026-07-25)

| Control | Status | Evidence |
|---------|--------|----------|
| Default local engine (no model) | **PASS** | `local-portfolio-assist.ts` pure client logic when `INHOUSE_AI_*` unset |
| Optional Approved Open AI model | **PASS** | OpenAI-compatible chat via server fn only (`inhouse-ai.functions.ts`); browser never holds API key; CSP unchanged (server egress only) |
| Per-org opt-in (default off) | **PASS** | `organizations.inhouse_ai_model_enabled` default false; platform_admin toggle only (`platform/inhouse-ai` + DB trigger); UI label Off=In-house AI / On=Approved Open AI model; no model egress unless org enabled |
| Model grounding | **PASS** | Server reloads RLS-scoped rows with user JWT + page ACL domains; compact context pack; system prompt forbids invention |
| Tenant + project visibility | **PASS** | Reads via Supabase client under RLS (`user_can_view_project`); child rows intersected to visible project ids (`assist-access.ts`) |
| Org isolation (defense-in-depth) | **PASS** | Bundle scoped with `org_id` match when present on project rows |
| Page ACL on AI topics | **PASS** | Risks/decisions/actions/budget/benefits only loaded & answered if sibling pages allowed; server also checks `/app/ai-assist` page ACL |
| Route page ACL (direct URL) | **PASS** | `usePageAccessGuard` in `app.tsx` redirects denied `PAGES` / admin-only paths |
| Home shortcuts honour page ACL | **PASS** | `app.index.tsx` filters shortcuts with `canView` |
| Query-cache isolation | **PASS** | AI uses dedicated React Query keys (`…, "ai-assist", select`) so narrow selects elsewhere cannot starve or widen AI cache |
| Egress volume | **PASS (reduced)** | Lean selects / domain-gated fetches; model path sends capped context pack only to configured `INHOUSE_AI_BASE_URL` |
| Rate limit | **PASS** | `askInhouseAi` limited per user (40 / 15 min) |
| Logging of prompts / answers | **PASS** | No server logging of Q&A text |
| Residual risk | **Accepted** | Page ACL default-allow when unconfigured; ops must point `INHOUSE_AI_BASE_URL` only at an approved endpoint (Azure OpenAI / private Ollama / gateway) with no-train / DPA terms |

### Per-org SSO (SAML) via white-label branding (2026-07-25)

| Control | Status | Evidence |
|---------|--------|----------|
| Default off | **PASS** | `organizations.sso_enabled` default false |
| Platform-admin only | **PASS** | DB trigger `tg_organizations_lock_sso_fields` + branding UI gated to platform admin |
| IdP registration | **Ops** | Supabase Auth SSO / `supabase sso add`; app stores provider id + domains only |
| Org membership after SSO | **PASS** | White-label `/auth?org=` runs `assertUserBelongsToOrgSlug`; unprovisioned users (no `profile.org_id`) are signed out so they cannot keep a session |
| No self-serve org via SSO entry | **PASS** | Onboarding blocks `create_org_and_join` when org white-label entry cookie is set |
| Model upstream errors | **PASS** | Client gets generic `model_error` only; upstream HTTP body logged server-side, not returned |

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
| Session tokens | **Mitigated** | `sessionStorage` + PKCE (`auth-storage.ts`); XSS still relevant while tab open — MFA + CSP |
| MFA | **Required for all users** | `/mfa` enroll + challenge; Settings cannot disable |
| Password reset | **OK** | Min length **8** |
| Email verification | **Config-dependent** | Dashboard + `AUTH_SETUP.md` |
| Forced password change bypass | **Fixed** | `completeForcedPasswordChange` sets password server-side |
| Session fixation | **Low** | Supabase issues new session on auth |
| JWT validation on server fns | **Present** | `auth-middleware.ts` (`getClaims`) |
| Device/session management UI | **Missing** | Nice-to-have |

### 1.2 Authorization / tenancy

| Risk | Status | Evidence |
|------|--------|----------|
| RBAC roles | **Present** | `app_role` + `user_roles` + helpers |
| RLS as primary data control | **Present** | Migrations enable RLS on created tables |
| UI page permissions | **Hardened** | Nav filter + `usePageAccessGuard` on `/app/*` ACL paths; In-house AI topics respect sibling page denies. Default-allow when matrix unconfigured remains (`permissions.ts`) |
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

### Still required (ops / certification evidence — not product blockers)

1. ~~**MFA**~~ **Done** (TOTP mandatory + BYOD AAL2)  
2. **HttpOnly cookie session** (or hardened XSS program + CSP nonce tightening) — future  
3. **Edge/WAF rate limits** (Vercel Firewall / Cloudflare) — in-process limiter is best-effort  
4. Continuous **SIEM / alerting** on `security_events` failed-login spikes  
5. ~~**Replace `xlsx`**~~ **Done**  
6. Tighten remaining any-member write tables (medium)  
7. **Malware scanning** for uploads / ban SVG logos or sanitize  
8. **Session device management** UI  
9. Keep production SQL migrations applied (including legal policy refresh + admin role scope)  
10. Formal **access-review minutes**, vendor DPAs, change tickets for Type II evidence period  

---

## Phase 3 – Compliance readiness

### SOC 2 Type II (gap summary) — updated 2026-07-30

| Area | Implemented | Missing / evidence needed |
|------|-------------|---------------------------|
| CC6 Logical access | RLS, RBAC, MFA AAL2 (UI + BYOD proxy), admin server asserts, BYOD authz layer | Joiner/mover/leaver **signed** access reviews (quarterly minutes) |
| CC7 Monitoring | `security_events`, `audit_events`, BYOD mutation logs, auditor Excel export | Central SIEM, failed-login alerts, on-call runbooks |
| CC8 Change mgmt | GitHub PRs | Formal CAB / prod change tickets retained for audit period |
| A1 Availability | Vercel/Supabase | DR/BCP tests, RTO/RPO docs (customer BYOD = customer DR) |
| C1 Confidentiality | TLS, RLS, BYOD secret encryption | Vendor encryption-at-rest attestations; BYOD tenant plane = customer host |
| PII / privacy | Privacy policy, DPA, subprocessors list, legal CMS | DPIA per customer as needed; retention schedule enforcement evidence |

**SOC 2 readiness (control design): ~75–80%**  
**SOC 2 Type II (evidence / observation period): ~45–55%** — needs 3–12 months operating evidence + auditor.

### ISO 27001 — updated 2026-07-30

| Theme | Status |
|-------|--------|
| ISMS docs (policies, risk register, access, incident, logging, vendors) | **Present** (`docs/isms/`) |
| Access control (A.5/A.8) | **Strong technical** (MFA, RBAC, RLS, BYOD AAL2+authz) |
| Cryptography | TLS via platform; BYOD secrets AES-256-GCM |
| Logging (A.8.15) | Auth + admin + BYOD mutations |
| Supplier security | Subprocessor list; need executed DPAs on file |
| Statement of Applicability / formal SoA | Draft via ISMS pack — certification body engagement still required |

**ISO readiness: ~60–65%** (docs + technical controls); certification needs formal SoA, internal audit, and registrar.

### OWASP ASVS Level 2 (by section)

| ASVS section | Result | Notes |
|--------------|--------|-------|
| V1 Architecture | **Partial** | Multi-tenant model exists; threat model doc missing |
| V2 Authentication | **Pass (with residual)** | MFA mandatory + AAL2 on BYOD; sessionStorage (not HttpOnly cookie) residual |
| V3 Session | **Partial** | Supabase refresh; no app session inventory |
| V4 Access control | **Pass/Partial** | RLS strong; BYOD proxy authz hardened; remaining broad write tables / UI default-allow |
| V5 Validation | **Partial** | Zod on server fns; bulk Excel/import weak |
| V6 Cryptography | **Partial** | Platform-managed |
| V7 Error handling | **Partial** | Some raw errors to client |
| V8 Data protection | **Partial** | Auth chrome cache in localStorage (non-secret); tokens in sessionStorage |
| V9 Communication | **Pass** | HTTPS/HSTS |
| V10 Malicious code | **Partial** | `xlsx` removed; no malware scanning on uploads yet |
| V11 Business logic | **Partial** | Provision/EOI/org lock fixed; some broad write policies remain |
| V12 Files | **Partial** | Size limits; weak MIME |
| V13 API | **Partial** | Billing fail-closed; in-process rate limits |
| V14 Config | **Pass/Partial** | CSP + headers + `.env.example` |

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
| XSS → steal session JWT | **Medium–High** | Full account while tab open | Any stored XSS | sessionStorage + CSP + DOMPurify + MFA |
| IDOR invoice email | **Medium** | Wrong-org email if authz bug | Mitigated by org check + zod UUID | Keep tests |
| SQLi | **Low** | — | Supabase client parameterized | Continue avoiding raw SQL in app |
| CSRF | **Low** | — | Bearer not cookie | Maintain |
| Mass assignment | **Medium** | Broad client updates | RLS + column grants | Prefer server fns for sensitive fields |
| `xlsx` exploit | **Fixed** | — | Excel import | Replaced with maintained parsers |
| Rate-limit bypass | **Medium** | Multi-instance serverless | In-memory limiter | Edge WAF |
| Tenant breakout via streams | **Medium** | See hidden project streams | SELECT policy | **Fixed** |

---

## Phase 5 – Scorecard & readiness

### Security scorecard (0–10) — revalidated 2026-07-30

| Domain | Score |
|--------|-------|
| Authentication | **9** (MFA all users + AAL2 on BYOD + PKCE + sessionStorage) |
| Authorization | **8** (RLS + BYOD authz layer; residual broad writes) |
| API Security | **8** |
| Database Security | **8** |
| Infrastructure Security | **8** (CSP + HSTS + fonts/Turnstile) |
| Monitoring | **8** (`security_events` + tenant `audit_events` + BYOD mutations) |
| Compliance docs | **9** (`docs/isms` + checklist + legal refresh) |

### Remaining medium items (not blockers for go-live)

1. Broad org-member write policies on some tables  
2. No malware scanning on uploads  
3. UI permissions default-allow when unconfigured  
4. CSP still allows `'unsafe-inline'` (needed for theme boot)  
5. HttpOnly cookie sessions (future hardening beyond sessionStorage)

### Enterprise readiness

| Metric | Score |
|--------|-------|
| **Current overall** | **88 / 100** (BYOD high findings closed) |
| **SOC 2 control design** | **~78%** |
| **SOC 2 Type II evidence** | **~50%** (needs observation period) |
| **ISO 27001 readiness** | **~62%** |
| **Enterprise procurement readiness** | **~85%** |

---

## Ops checklist

See **[`COMPLIANCE_CHECKLIST.md`](./COMPLIANCE_CHECKLIST.md)** — single source of truth for what you must run/click.

Key SQL still to apply if not already:

1. `20260725120000_security_hardening.sql` (earlier hardening)  
2. `20260725160000_security_events_and_eoi_revoke.sql` (auth logging table + EOI grant revoke)  

---

## Appendix – Key files

- `supabase/migrations/20260725120000_security_hardening.sql`  
- `supabase/migrations/20260725160000_security_events_and_eoi_revoke.sql`  
- `src/lib/security-audit.ts` / `src/lib/auth-events.functions.ts`  
- `src/integrations/supabase/auth-storage.ts` / `client.ts`  
- `src/lib/mfa.ts` / `src/routes/mfa.tsx`  
- `src/lib/excel-io.ts`  
- `vercel.json`  
- `docs/isms/*` / `docs/COMPLIANCE_CHECKLIST.md`  

