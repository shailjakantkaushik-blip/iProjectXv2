# Access Control Policy

**Effective:** 2026-07-25  
**Updated:** 2026-07-30  

## 1. Authentication
- Primary IdP: **Supabase Auth** (email/password; OAuth optional)  
- **Optional per-org SSO (SAML)** via white-label branding when provisioned  
- Sessions use **PKCE** and are stored in **sessionStorage** (not localStorage JWTs)  
- **MFA (TOTP authenticator app) is mandatory for every user** and cannot be disabled in-app  
- Authenticated app shell and **BYOD tenant data proxy** both require **AAL2** (MFA satisfied)  
- Minimum password length: **8** characters (forced change for provisioned accounts)  
- Auth security events are written to `security_events` (and `audit_events` when org is known)

### Supabase dashboard requirement
Enable MFA under **Authentication → Multi-factor authentication → TOTP**. Without this, the app cannot enroll factors.

### SSO
Org SSO stores provider id + email domains only. Membership is enforced after SSO sign-in (`assertUserBelongsToOrgSlug`). Unprovisioned users are signed out.

## 2. Authorisation
- Tenant isolation via `org_id` and Postgres **RLS** on the shared data plane  
- When **BYOD** is active, tenant REST is proxied to the customer DB with:
  - platform JWT + **AAL2**
  - home-org from `profiles`
  - role gates (editors / admins)
  - project visibility filters (from customer projects + org `ui_config`)
  - timesheet owner scoping for non-privileged users
  - mutation audit to `security_events`
- Privileged server functions assert platform/org admin  
- UI page permissions are secondary to RLS / proxy authz  

## 3. Joiner / Mover / Leaver
| Event | Control |
|-------|---------|
| Joiner | Org/platform admin provisions user; temporary password + forced change |
| Mover | Role assign/remove audited; org_id changes restricted |
| Leaver | Deactivate (`is_active=false` + Auth ban) or platform delete |

## 4. Access reviews
Org admins should review user roles quarterly. Platform admins review `platform_admin` membership quarterly. Retain signed minutes for SOC 2 Type II evidence.

## 5. Service accounts
`SUPABASE_SERVICE_ROLE_KEY`, `BILLING_CRON_SECRET`, and `BYOD_SECRETS_KEK` are server-only secrets; never exposed to the browser.
